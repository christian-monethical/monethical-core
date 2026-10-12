"""Lambda entrypoint: authenticated console API (behind the API Gateway JWT authorizer)."""

from __future__ import annotations

from typing import Any

from aws_lambda_powertools.utilities.typing import LambdaContext

from monethical.api import console_modules, console_sites
from monethical.api.common import build_app, logger

app = build_app(title="Monethical Console API")
app.include_router(console_sites.router, prefix="/v1")
app.include_router(console_modules.router, prefix="/v1")


@logger.inject_lambda_context
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    return app.resolve(event, context)
