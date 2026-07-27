"""クライアントのネットワーク識別（同一 Wi-Fi ≈ 同一公開 IP）。"""


def client_ip_from_request(request) -> str:
    """Django HTTP リクエストからクライアント IP を得る。"""
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[0].strip()
    return (request.META.get('REMOTE_ADDR') or '').strip()


def client_ip_from_scope(scope) -> str:
    """Channels WebSocket scope からクライアント IP を得る。"""
    headers = dict(scope.get('headers') or [])
    xff = headers.get(b'x-forwarded-for', b'').decode('latin-1')
    if xff:
        return xff.split(',')[0].strip()
    client = scope.get('client')
    if client:
        return client[0]
    return ''
