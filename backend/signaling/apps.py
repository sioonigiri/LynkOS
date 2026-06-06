import os
import threading

from django.apps import AppConfig


class SignalingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'signaling'

    def ready(self) -> None:
        import sys

        # runserver のリローダ親プロセスでは二重登録を避ける（daphne では RUN_MAIN は未設定）
        if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') != 'true':
            return
        from .mdns_hub import start_hub_advertisement

        def _try_start(attempt: int = 0) -> None:
            if start_hub_advertisement():
                return
            if attempt < 5:
                threading.Timer(2.0, lambda: _try_start(attempt + 1)).start()

        _try_start()
