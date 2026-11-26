import logging
import uuid
from typing import Dict, List, Optional, Set, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.credential import ProviderCredential
from app.models.health import CredentialHealth
from app.models.quota import QuotaGroup
from app.routing.cooldown_manager import CooldownManager
from app.routing.quota_manager import QuotaManager
from app.routing.schemas import SelectedCredential
from app.services.encryption import get_encryption_service

logger = logging.getLogger("axly.routing.credential_selector")


class CredentialSelector:
    """
    Selects the highest-priority eligible credential for a provider.
    Excludes credentials that are:
      - In active cooldown
      - Marked with permanent authentication or permission failures
      - Belonging to an exhausted/cooldown shared quota group
      - Administratively disabled
      - Already attempted in the current request
    """

    @classmethod
    async def select_eligible_credential(
        cls,
        db: AsyncSession,
        provider_id: uuid.UUID,
        excluded_credential_ids: Optional[Set[uuid.UUID]] = None,
    ) -> Tuple[Optional[SelectedCredential], List[Dict[str, str]]]:
        """
        Evaluates credentials for a provider in priority order.
        Returns (selected_credential, exclusion_log).
        """
        excluded_ids = excluded_credential_ids or set()
        exclusion_log: List[Dict[str, str]] = []

        stmt = (
            select(ProviderCredential)
            .options(
                selectinload(ProviderCredential.health),
                selectinload(ProviderCredential.quota_group),
            )
            .where(
                ProviderCredential.provider_id == provider_id,
            )
            # Prefer the least-used key within each configured priority tier. Randomize
            # ties to spread concurrent requests across workers and avoid oldest-key bias.
            .order_by(
                ProviderCredential.priority.asc(),
                ProviderCredential.requests_count.asc(),
                func.random(),
            )
        )
        credentials = (await db.execute(stmt)).scalars().all()

        if not credentials:
            exclusion_log.append({
                "credential": "none",
                "reason": "No credentials configured for provider",
            })
            return None, exclusion_log

        encryption_service = get_encryption_service()

        for cred in credentials:
            cred_label = f"{cred.label} ({cred.key_preview})"

            # 0. Check if administratively disabled
            if not cred.is_active:
                exclusion_log.append({
                    "credential": cred_label,
                    "reason": "Excluded: Credential is administratively disabled",
                })
                continue

            # 1. Check if already attempted in this request
            if cred.id in excluded_ids:
                exclusion_log.append({
                    "credential": cred_label,
                    "reason": "Excluded: already attempted in this request",
                })
                continue

            # 2. Check Quota Group eligibility
            qg_eligible, qg_reason = await QuotaManager.is_quota_group_eligible(
                db, cred.quota_group_id
            )
            if not qg_eligible:
                exclusion_log.append({
                    "credential": cred_label,
                    "reason": f"Excluded by shared quota: {qg_reason}",
                })
                continue

            # 3. Check Credential Health & Cooldown eligibility
            health_eligible, health_reason = await CooldownManager.check_and_recover_credential(
                db, cred, cred.health
            )
            if not health_eligible:
                exclusion_log.append({
                    "credential": cred_label,
                    "reason": f"Excluded by health/cooldown: {health_reason}",
                })
                continue

            # 4. Decrypt secret securely
            try:
                decrypted_secret = encryption_service.decrypt(cred.encrypted_api_key)
            except Exception as exc:
                logger.error(f"Decryption failure for credential {cred.id}: {exc}")
                exclusion_log.append({
                    "credential": cred_label,
                    "reason": "Decryption failure on encrypted secret",
                })
                continue

            # Winner selected!
            selected = SelectedCredential(
                credential_id=cred.id,
                provider_id=cred.provider_id,
                label=cred.label,
                key_preview=cred.key_preview,
                priority=cred.priority,
                quota_group_id=cred.quota_group_id,
                decrypted_api_key=decrypted_secret,
                health_status=cred.health.status if cred.health else "healthy",
                cooldown_until=cred.health.cooldown_until if cred.health else None,
            )
            return selected, exclusion_log

        return None, exclusion_log
