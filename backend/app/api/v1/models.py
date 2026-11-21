from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_gateway_key
from app.db.dependencies import get_db
from app.models.gateway_key import GatewayApiKey
from app.models.model import Model
from app.models.routing import ModelAlias
from app.providers.schemas import ModelCard, ModelListResponse

router = APIRouter(tags=["Models"])


@router.get("/models", response_model=ModelListResponse)
async def list_models(
    gateway_key: GatewayApiKey = Depends(get_current_gateway_key),
    db: AsyncSession = Depends(get_db),
):
    """
    OpenAI-compatible models catalog endpoint.
    Returns list of all enabled models registered in AXLY Gateway.
    """
    stmt = (
        select(Model)
        .options(selectinload(Model.provider))
        .where(Model.is_enabled == True)
        .order_by(Model.display_name.asc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    model_cards: List[ModelCard] = []
    for m in records:
        owned_by = m.provider.name if m.provider else "system"
        model_cards.append(
            ModelCard(
                id=m.model_identifier,
                created=int(m.created_at.timestamp()),
                owned_by=owned_by,
                context_window=m.context_window,
                input_price_per_million=m.input_price_per_million,
                output_price_per_million=m.output_price_per_million,
                capabilities=m.capabilities or {},
            )
        )

    # Include enabled model aliases in the OpenAI models list
    alias_stmt = select(ModelAlias).where(ModelAlias.is_enabled == True).order_by(ModelAlias.alias_name.asc())
    aliases = (await db.execute(alias_stmt)).scalars().all()
    for a in aliases:
        model_cards.append(
            ModelCard(
                id=a.alias_name,
                created=int(a.created_at.timestamp()),
                owned_by="axly-routing-alias",
                context_window=32768,
                capabilities=a.required_capabilities or {},
            )
        )

    return ModelListResponse(data=model_cards)
