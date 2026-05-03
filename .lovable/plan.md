আমি logs/database দেখে পেয়েছি ZiniPay checkout fail করার মূল কারণ: admin panel-এ API config key name হিসেবে `zinipay` save হয়েছে, কিন্তু Edge Function শুধু `api_key`, `apiKey`, `ZINIPAY_API_KEY`, `key` পড়ছে। তাই admin key দেওয়ার পরও function সেটাকে ZiniPay API key হিসেবে ধরছে না, fallback/env না থাকলে বা ভুল key গেলে ZiniPay 401 দিয়ে `{ status:false, message:"Internal Server Error" }` ফেরাচ্ছে।

Plan:

1. ZiniPay credential resolver ঠিক করব
   - `zinipay-create-invoice`, `zinipay-verify-payment`, `zinipay-webhook`-এ DB থেকে API key পড়ার logic আরও flexible করব।
   - Supported admin config keys হবে: `api_key`, `zinipay`, `zini_api_key`, `zinipay_api_key`, `ZINIPAY_API_KEY`, `apiKey`, `key`।
   - Active gateway নির্বাচন currency/mode/provider অনুযায়ী বেশি reliable করব, যেন ভুল gateway না পড়ে।

2. Razorpay credential resolver harden করব
   - Razorpay functions-এ `key_id`, `key_secret`, `razorpay_key_id`, `razorpay_key_secret`, `webhook_secret` variants support করব।
   - Multiple active gateway থাকলে correct `provider: razorpay` বা gateway name/currency অনুযায়ী config pick করা হবে।

3. Admin Payment Gateways UI সহজ করব
   - ZiniPay edit screen-এ generic “Key/Value Add” এর বদলে direct field দেখাব: `ZiniPay API Key`। Save করলে internally `api_key`-তে save হবে।
   - Existing ভুল key `zinipay` থাকলে UI সেটা read করে `api_key` হিসেবে দেখাবে, যাতে admin আবার paste না করলেও fix হয়।
   - Razorpay-এর জন্য direct fields দেখাব: `Key ID`, `Key Secret`, `Webhook Secret`।
   - Sensitive values mask করব, কিন্তু update করার option থাকবে।

4. Checkout error message পরিষ্কার করব
   - এখন user side শুধু “Internal Server Error” দেখাচ্ছে। এটাকে বদলে actionable message দেখাব: API key rejected / brand domain mismatch / gateway not configured।
   - Frontend error parsing `zinipayCheckout.ts`-এ improve করব যাতে Edge Function-এর `details` বা `error` message toast-এ ঠিকমতো আসে।

5. Existing saved config migrate/fallback করব
   - Code-level fallback থাকবে, তাই database migration ছাড়াও current `api_config: { "zinipay": "..." }` কাজ করবে।
   - দরকার হলে একটি small migration দিয়ে existing `zinipay` key থেকে `api_key` copy করে normalize করব, কিন্তু secret value expose না করে।

6. Verification
   - Edge function logs দিয়ে confirm করব function আর “key missing/wrong field” অবস্থায় নেই।
   - ZiniPay response যদি এরপরও 401 দেয়, তাহলে সেটা হবে real ZiniPay side issue: wrong API key, inactive merchant, test/live key mismatch, বা registered brand/domain mismatch. তখন UI-তে exact guidance দেখাবে।

Expected result:
- Admin panel-এ API key দিলেই user side ZiniPay/Razorpay flow সেই config ব্যবহার করবে।
- `zinipay` নামে ভুল key save থাকলেও checkout কাজ করবে।
- Payment fail হলে admin/user বুঝতে পারবে API key ভুল, domain mismatch, না gateway config missing।