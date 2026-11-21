# AXLY Gateway: Routing & Failover Troubleshooting Guide

## 1. Diagnostic Architecture & Tools

When unexpected routing behavior occurs, AXLY Gateway provides transparent diagnostic data at three levels:
1. **API Error Details:** Detailed error payloads conforming to the OpenAI standard with normalized codes.
2. **Routing Trace History (`routing_history`):** Complete per-attempt records detailing candidate selection, exclusion reasons, status codes, and latency.
3. **Admin Health & Circuit Breaker Dashboards:** Real-time visibility into credentials, quota groups, and circuit breaker states.

---

## 2. Common Scenarios & Resolutions

### Scenario A: "No eligible candidates or credentials available for model: [alias]" (HTTP 503)

**Root Cause:**
- All candidates configured for the alias are either disabled, in active cooldown, or tripped by circuit breakers.
- Alternatively, candidates have no active credentials with healthy states.

**Diagnostic Steps:**
1. Check alias configuration:
   ```powershell
   curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/routing/aliases
   ```
2. Inspect health overview across all credentials:
   ```powershell
   curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/routing/health/overview
   ```
3. Inspect circuit breaker states:
   ```powershell
   curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/circuit-breakers
   ```

**Resolution:**
- If credentials are stuck in cooldown, wait for expiry or manually clear cooldown:
  ```powershell
  curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/credentials/<CRED_ID>/recover
  ```
- If circuit breaker is OPEN, reset it:
  ```powershell
  curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/circuit-breakers/<CB_ID>/reset
  ```

---

### Scenario B: Shared Quota Group Exhaustion (429 Sibling Cascade)

**Symptom:**
- A failure on Gemini Key 01 immediately causes Gemini Key 02 and Key 03 to be skipped without attempting them.

**Expected Behavior:**
- This is intentional behavior when multiple keys belong to a shared `QuotaGroup` (e.g. same Google Cloud Project). The engine detects that trying sibling keys would only cause redundant 429s and immediately fails over to Groq or OpenAI.

**Verification:**
Query the routing trace for the request:
```powershell
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/admin/routing/history?request_id=<REQUEST_ID>"
```
Look for exclusion log:
```json
{
  "credential": "Gemini Key 02 (AIza...)",
  "reason": "Excluded by shared quota: Quota group 'gemini-shared-cloud-project' is in cooldown until 2026-11-21T18:45:00Z"
}
```

---

### Scenario C: Credential Stuck in "authentication_failure" (401)

**Symptom:**
- An API key was revoked or mistyped, and the engine marked it with `status: "authentication_failure"`.
- The key does not auto-recover.

**Expected Behavior:**
- Under Prompt 3 security rules, temporary rate limits auto-recover, but authentication failures **NEVER** auto-recover automatically. They require administrator verification.

**Resolution:**
1. Update the credential with a valid API key via `PATCH /api/admin/credentials/{id}`.
2. Trigger verified recovery:
   ```powershell
   curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
     -d '{"validate_upstream": true}' `
     http://localhost:8000/api/admin/credentials/<CRED_ID>/recover
   ```
   If the upstream provider accepts the key, status returns to `healthy`.

---

## 3. Useful PowerShell Administrative Commands

### Check Routing History for Last 10 Requests
```powershell
$TOKEN = "your-admin-jwt-token"
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/routing/history?limit=10" `
  -Headers @{ Authorization = "Bearer $TOKEN" } | ConvertTo-Json -Depth 5
```

### Inspect Provider Health Overview
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/routing/health/overview" `
  -Headers @{ Authorization = "Bearer $TOKEN" } | ConvertTo-Json -Depth 5
```

### Test Chat Completion with Routing Trace
```powershell
$GW_KEY = "axly-your-gateway-api-key"
$body = @{
  model = "fast"
  messages = @(@{ role = "user"; content = "Hello AXLY!" })
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/v1/chat/completions" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $GW_KEY"; "Content-Type" = "application/json" } `
  -Body $body | ConvertTo-Json -Depth 5
```
