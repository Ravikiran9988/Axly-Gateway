import logging
from typing import Any, Dict, List, Optional, Set
from app.routing.schemas import RoutingCandidate

logger = logging.getLogger("axly.routing.candidate_selector")


class CandidateSelector:
    """
    Filters, validates capabilities, orders, and deduplicates upstream provider/model candidates.
    """

    @classmethod
    def filter_and_order_candidates(
        cls,
        candidates: List[RoutingCandidate],
        strategy: str = "priority",
        required_capabilities: Optional[Dict[str, Any]] = None,
    ) -> List[RoutingCandidate]:
        """
        Filters candidates by active status and requested capabilities,
        orders them according to the routing profile strategy,
        and eliminates duplicates.
        """
        eligible: List[RoutingCandidate] = []
        seen_pairs: Set[str] = set()

        for cand in candidates:
            if not cand.is_active:
                continue

            pair_key = f"{cand.provider_name}:{cand.model_identifier}".lower()
            if pair_key in seen_pairs:
                continue

            # Verify capability requirements if specified
            if required_capabilities:
                cand_caps = cand.capabilities or {}
                mismatch = False
                for req_key, req_val in required_capabilities.items():
                    if req_val and not cand_caps.get(req_key, False):
                        mismatch = True
                        break
                if mismatch:
                    logger.debug(f"Candidate {pair_key} excluded due to capability mismatch")
                    continue

            seen_pairs.add(pair_key)
            eligible.append(cand)

        # Ordering based on strategy
        if strategy == "priority":
            eligible.sort(key=lambda c: (c.priority, c.model_identifier))
        # (Future strategies like latency or cost can be plugged in here when metric data is available)

        return eligible
