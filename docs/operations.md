# Operations

## Runtime

- Container image: multi-stage `Dockerfile` using Next.js standalone output
- Default port: `3000`
- Health probe: `GET /api/health`
- Readiness probe: `GET /api/ready`

## Required GitHub Secrets

- `DEPLOY_WEBHOOK_URL`: deployment endpoint for your platform or orchestrator

## Recommended Platform Configuration

- Run at least 2 replicas behind a load balancer
- Enable HTTPS termination at the edge
- Set container restart policy to `always`
- Configure readiness checks against `/api/ready`
- Configure liveness checks against `/api/health`
- Ship stdout/stderr to a centralized log sink
- Alert on 5xx rate, failed readiness probes, and payment callback failures

## Logging

- Structured JSON logs are emitted to stdout/stderr
- Set `LOG_LEVEL=info` in production
- Sensitive fields containing `secret`, `token`, `key`, `authorization`, `cookie`, or `pass` are redacted

## Monitoring

- Track request error rate
- Track container restarts
- Track checkout failures
- Track M-Pesa callback failures
- Track median and p95 response time for `/api/checkout` and `/api/mpesa/callback`
