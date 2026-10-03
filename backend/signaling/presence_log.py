"""
端末一覧の出入りを追うための構造化ログ（1 行 1 イベント、key=value 形式）。

例:
  presence event=register inst=3fa9c1 up=12.4s device=device-17... platform=windows group=a1b2c3d4 via=http change=new
  presence event=remove   inst=3fa9c1 up=80.1s device=ios-... group=a1b2c3d4 reason=http-delete age=0.4s

- inst / up: サーバーのインスタンス ID と起動からの秒数。デプロイ直後の新旧インスタンスの並走や、
  再起動後に端末が登録し直す様子を区別するために全行へ付ける。
- group: ネットワークキー（公開 IP）の HMAC。IP そのものはログに残さない。
- 端末名は個人名を含みうるため記録しない（deviceId と platform のみ）。
- 内容が変わらない heartbeat は DEBUG（LYNKOS_LOG_LEVEL=DEBUG のときだけ出力）。
"""
import hashlib
import hmac
import logging
import secrets
import time

from django.conf import settings

logger = logging.getLogger('lynkos.presence')

INSTANCE_ID = secrets.token_hex(3)
_STARTED_AT = time.time()


def group_tag(client_ip: str) -> str:
    if not client_ip:
        return '-'
    digest = hmac.new(settings.SECRET_KEY.encode(), client_ip.encode(), hashlib.sha256)
    return digest.hexdigest()[:8]


def _format(value) -> str:
    if isinstance(value, float):
        return f'{value:.1f}s'
    text = str(value)
    return text.replace(' ', '_') if text else '-'


def log_event(event: str, level: int = logging.INFO, **fields):
    if not logger.isEnabledFor(level):
        return
    parts = [f'event={event}', f'inst={INSTANCE_ID}', f'up={time.time() - _STARTED_AT:.1f}s']
    parts += [f'{k}={_format(v)}' for k, v in fields.items() if v is not None]
    logger.log(level, 'presence ' + ' '.join(parts))
