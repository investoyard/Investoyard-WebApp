#!/bin/bash
# Investoyard full-stack regression sweep
cd /d/Investoyard
API=http://localhost:3000/api
P() { .tools/pgsql/bin/psql.exe -h localhost -p 5433 -U postgres -d investoyard -tAc "$1"; }
R() { .tools/redis/redis-cli.exe -p 6379 "$@"; }
PASS=0; FAIL=0
ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAIL=$((FAIL+1)); echo "FAIL  $1  (got: $2, want: $3)"; fi; }
tok() { local rid; rid=$(curl -s -X POST $API/auth/otp/request -H "Content-Type: application/json" -H "x-tenant: ${2:-investoyard}" -d "{\"mobile\":\"$1\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).requestId'); curl -s -X POST $API/auth/otp/verify -H "Content-Type: application/json" -H "x-tenant: ${2:-investoyard}" -d "{\"requestId\":\"$rid\",\"otp\":\"123456\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken'; }

# 1. health + system
ck "health probe"            "$(curl -s $API/health | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); d.status+"/"+d.checks.database+"/"+d.checks.redis')" "ok/up/up"
SUPER=$(tok 9000000001); PBADM=$(tok 9000000002)
ck "system status modes"     "$(curl -s $API/admin/status -H "Authorization: Bearer $SUPER" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); String(d.queue.includes("BullMQ"))+"/"+String(d.vault.includes("AES"))')" "true/true"

# 2. tenants + cascade
ck "tenant flags cascade"    "$(curl -s $API/tenants | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); String(d.find(t=>t.slug==="partnerbank-mumbai").flags.gmpEnabled)')" "false"
ck "cascade lock source"     "$(curl -s $API/settings/partnerbank-mumbai | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); String(d.settings.gmpEnabled.locked)+"/"+d.settings.gmpEnabled.source')" "true/partnerbank"

# 3. RBAC representative row
ck "RBAC settings super 200" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/settings/axis/gmpEnabled -H 'Content-Type: application/json' -H "Authorization: Bearer $SUPER" -d '{"value":true,"locked":false}')" "200"
ck "RBAC settings scope 403" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/settings/axis/gmpEnabled -H 'Content-Type: application/json' -H "Authorization: Bearer $PBADM" -d '{"value":true}')" "403"
ck "RBAC noauth 401"         "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/settings/axis/gmpEnabled -H 'Content-Type: application/json' -d '{"value":true}')" "401"

# 4. auth internals (redis OTP store + real OTP)
RID=$(curl -s -X POST $API/auth/otp/request -H "Content-Type: application/json" -H "x-tenant: investoyard" -d '{"mobile":"9995551111"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).requestId')
TTL=$(R ttl otp:$RID | tr -d '\r')
OK_TTL=$(node -pe "($TTL>250 && $TTL<=300) ? 'ok' : 'bad'")
ck "OTP in redis w/ TTL"     "$(R exists otp:$RID | tr -d '\r')/$OK_TTL" "1/ok"
sleep 1
REAL=$(grep "9995551111" apps/api/.apilog.txt | grep -oE "OTP is [0-9]{6}" | tail -1 | grep -oE "[0-9]{6}")
ck "real OTP verifies"       "$(curl -s -X POST $API/auth/otp/verify -H 'Content-Type: application/json' -H 'x-tenant: investoyard' -d "{\"requestId\":\"$RID\",\"otp\":\"$REAL\"}" | node -pe 'String(!!JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken)')" "true"

# 5. apply flow
CUST=$(tok 9995552222)
curl -s -o /dev/null -X POST $API/profiles -H "Content-Type: application/json" -H "Authorization: Bearer $CUST" -d '{"relationship":"self","fullName":"Sweep Tester","pan":"UUUPZ1818U","depository":"NSDL","dpId":"IN300001","clientId":"1001","upiId":"s@upi"}'
ck "PII v2 envelope in DB"   "$(P 'select left("panTokenRef",9) from "InvestorProfile" p join "User" u on u.id=p."userId" where u.mobile=$$9995552222$$;')" "v2:local:"
DUP=$(tok 9995553333)
ck "dup PAN 409"             "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/profiles -H 'Content-Type: application/json' -H "Authorization: Bearer $DUP" -d '{"relationship":"self","fullName":"Dup","pan":"UUUPZ1818U","depository":"NSDL","dpId":"IN300001","clientId":"1001"}')" "409"
PROF=$(curl -s $API/profiles -H "Authorization: Bearer $CUST" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].id')
ACME=$(curl -s $API/ipos/by-symbol/ACME | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
ck "consent gate 403"        "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/applications -H 'Content-Type: application/json' -H "Authorization: Bearer $CUST" -d "{\"investorProfileId\":\"$PROF\",\"ipoId\":\"$ACME\",\"category\":\"IND\",\"lots\":2,\"atCutoff\":true,\"applyMethod\":\"native\"}")" "403"
APPID=$(curl -s -X POST $API/applications -H "Content-Type: application/json" -H "Authorization: Bearer $CUST" -d "{\"investorProfileId\":\"$PROF\",\"ipoId\":\"$ACME\",\"category\":\"IND\",\"lots\":2,\"atCutoff\":true,\"applyMethod\":\"native\",\"dataSharingConsent\":true}" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).application.id')
ck "apply submitted"         "$(P "select status from \"Application\" where id='$APPID';")" "submitted"
ck "one-PAN-per-IPO 409"     "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/applications -H 'Content-Type: application/json' -H "Authorization: Bearer $CUST" -d "{\"investorProfileId\":\"$PROF\",\"ipoId\":\"$ACME\",\"category\":\"IND\",\"lots\":1,\"atCutoff\":true,\"applyMethod\":\"native\",\"dataSharingConsent\":true}")" "409"
sleep 2
JOBKEY=$(R keys "bull:submissions:*" | tr -d '\r' | head -1)
if [ -n "$JOBKEY" ]; then LEAN=$(R hget "$JOBKEY" data 2>/dev/null | grep -c '"pan"'); else LEAN="nokey"; fi
ck "no PII in redis job"     "$LEAN" "0"

# 6. allotment + notification
ck "allotment RBAC 403"      "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/applications/$APPID/allotment -H 'Content-Type: application/json' -H "Authorization: Bearer $CUST" -d '{"allottedLots":1}')" "403"
curl -s -o /dev/null -X POST $API/applications/$APPID/allotment -H 'Content-Type: application/json' -H "Authorization: Bearer $SUPER" -d '{"allottedLots":1}'
ck "refund math"             "$(curl -s $API/applications -H "Authorization: Bearer $CUST" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); d[0].status+"/"+d[0].refundAmount')" "allotted/14910"
ck "allotment notification"  "$(curl -s $API/notifications -H "Authorization: Bearer $CUST" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).filter(n=>n.type==="allotment").length')" "1"

# 7. family bulk apply (NSE addbulk path)
FAM=$(tok 9995554444)
curl -s -o /dev/null -X POST $API/profiles -H "Content-Type: application/json" -H "Authorization: Bearer $FAM" -d '{"relationship":"self","fullName":"Fam Self","pan":"AAAQZ0001A","depository":"NSDL","dpId":"IN300001","clientId":"1001","upiId":"f1@upi"}'
curl -s -o /dev/null -X POST $API/profiles -H "Content-Type: application/json" -H "Authorization: Bearer $FAM" -d '{"relationship":"spouse","fullName":"Fam Spouse","pan":"AAAQZ0002B","depository":"NSDL","dpId":"IN300001","clientId":"1001","upiId":"f2@upi"}'
FPROFS=$(curl -s $API/profiles -H "Authorization: Bearer $FAM" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).map(p=>p.id).join(" ")')
set -- $FPROFS; F1=$1; F2=$2
NIMBUS=$(curl -s $API/ipos/by-symbol/NIMBUS | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
HELIOS=$(curl -s $API/ipos/by-symbol/HELIOS | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
ck "bulk apply 2 members"    "$(curl -s -X POST $API/applications/bulk -H 'Content-Type: application/json' -H "Authorization: Bearer $FAM" -d "{\"ipoId\":\"$NIMBUS\",\"category\":\"IND\",\"applyMethod\":\"native\",\"dataSharingConsent\":true,\"applicants\":[{\"investorProfileId\":\"$F1\",\"lots\":1},{\"investorProfileId\":\"$F2\",\"lots\":1}]}" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); d.count+"/"+d.applications.every(a=>a.status==="submitted")')" "2/true"
ck "bulk all-or-nothing 400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/applications/bulk -H 'Content-Type: application/json' -H "Authorization: Bearer $FAM" -d "{\"ipoId\":\"$HELIOS\",\"category\":\"IND\",\"applyMethod\":\"native\",\"dataSharingConsent\":true,\"applicants\":[{\"investorProfileId\":\"$F1\",\"lots\":1},{\"investorProfileId\":\"$F2\",\"lots\":1,\"applicantType\":\"shareholder\"}]}")/$(P "select count(*) from \"Application\" a join \"User\" u on u.id=a.\"userId\" where u.mobile='9995554444' and a.\"ipoId\"='$HELIOS';")" "400/0"
ck "bulk dup-in-batch 409"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/applications/bulk -H 'Content-Type: application/json' -H "Authorization: Bearer $FAM" -d "{\"ipoId\":\"$HELIOS\",\"category\":\"IND\",\"applyMethod\":\"native\",\"dataSharingConsent\":true,\"applicants\":[{\"investorProfileId\":\"$F1\",\"lots\":1},{\"investorProfileId\":\"$F1\",\"lots\":1}]}")" "409"
sleep 2
BKEY=$(R keys "bull:submissions:bulk:*" | tr -d '\r' | head -1)
if [ -n "$BKEY" ]; then BPAY=$(R hget "$BKEY" data | tr -d '\r'); BOK=$(echo "$BPAY" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); j.applicationIds.length+"/"+String(JSON.stringify(j).includes("pan"))'); else BOK="nokey"; fi
ck "bulk lean job (no PII)"  "$BOK" "2/false"
ck "bulk batch grouped"      "$(curl -s $API/admin/applications/investoyard -H "Authorization: Bearer $SUPER" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")).filter(a=>a.mobileMasked==="99****4444"); d.length+"/"+new Set(d.map(a=>a.batchId)).size+"/"+String(d.every(a=>!!a.batchId))')" "2/1/true"
ck "allotment CSV import"    "$(curl -s -X POST $API/admin/allotments/NIMBUS/import -H 'Content-Type: application/json' -H "Authorization: Bearer $SUPER" -d '{"csv":"AAAQZ0001A,1\nAAAQZ0002B,0"}' | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); d.updated+"/"+d.notFound.length+"/"+d.errors.length')" "2/0/0"

# 8. reports + audit + rails + dashboard
# 3 applications in scope by now: 1 single (allotted) + 2 family bulk (1 allotted via CSV import).
ck "reports aggregate"       "$(curl -s $API/admin/reports/investoyard -H "Authorization: Bearer $SUPER" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); d.totals.applications+"/"+d.allotment.allotted')" "3/2"
ck "csv export header"       "$(curl -s -D - -o /dev/null $API/admin/reports/investoyard/export -H "Authorization: Bearer $SUPER" | grep -ci 'text/csv')" "1"
ck "audit recorded"          "$(curl -s $API/admin/audit -H "Authorization: Bearer $SUPER" | node -pe 'String(JSON.parse(require("fs").readFileSync(0,"utf8")).filter(a=>a.action==="allotment.record").length>=1)')" "true"
ck "rail handshake classify" "$(curl -s -X POST $API/admin/rails/seed-nse-axis/test -H "Authorization: Bearer $SUPER" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).outcome')" "invalid_secret"
ck "dashboard counts"        "$(curl -s $API/admin/dashboard/investoyard-platform -H "Authorization: Bearer $SUPER" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); d.counts.iposTotal+"/"+d.counts.tenants')" "9/5"

echo
echo "================= SWEEP RESULT: $PASS passed, $FAIL failed ================="

# cleanup
P 'delete from "Notification" where "userId" in (select id from "User" where mobile like $$999555%$$);' >/dev/null
P 'delete from "ApplicationStatusEvent" e using "Application" a,"User" u where e."applicationId"=a.id and a."userId"=u.id and u.mobile like $$999555%$$;' >/dev/null
P 'delete from "Application" x using "User" u where x."userId"=u.id and u.mobile like $$999555%$$;' >/dev/null
P 'delete from "Consent" x using "User" u where x."userId"=u.id and u.mobile like $$999555%$$;' >/dev/null
P 'delete from "InvestorProfile" x using "User" u where x."userId"=u.id and u.mobile like $$999555%$$;' >/dev/null
P 'delete from "User" where mobile like $$999555%$$;' >/dev/null
P 'delete from "AuditLog";' >/dev/null
for k in $(R keys "bull:submissions:*" | tr -d '\r'); do R del "$k" >/dev/null; done
echo "cleaned -> users:$(P 'select count(*) from "User";') apps:$(P 'select count(*) from "Application";')"
