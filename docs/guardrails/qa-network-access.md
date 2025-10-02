# QA environment network access

The hosted QA review environment allows reading the repository contents but blocks
outbound HTTP(S) traffic at the proxy layer. Even when the "Agent internet
access" toggle is enabled, requests to external domains fail with `403` responses
from the sandbox proxy. The `curl` example below shows the current behaviour when
attempting to reach LiveRC:

```bash
curl -I https://canberraoffroad.liverc.com/results/
```

```
HTTP/1.1 403 Forbidden
content-length: 16
content-type: text/plain
date: Thu, 02 Oct 2025 11:23:07 GMT
server: envoy
connection: close

curl: (56) CONNECT tunnel failed, response 403
```

Because of this restriction, fetch LiveRC slugs from a local workstation or any
non-sandboxed environment before exercising the import API.
