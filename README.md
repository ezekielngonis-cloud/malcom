# Market HARVA

A static GitHub Pages marketplace front end connected to the existing Supabase project.

## Publishing
1. Keep the folder paths intact: `index.html`, `admin.html`, `css/`, `js/`, and `supabase/`.
2. Publish the repository root from the branch selected in GitHub Pages.
3. `js/config.js` contains only the project URL and browser-safe publishable key. Never add a Supabase service-role/secret key to browser code.
4. The existing Supabase schema is included for reference only. Do not rerun it against an already-configured production project.

## Email confirmation
The sign-up flow requests a redirect back to the deployed site and offers a resend button. Supabase must still allow the exact GitHub Pages URL under Authentication > URL Configuration > Redirect URLs. If confirmation emails do not arrive, verify Authentication > Providers > Email and the project's email/SMTP delivery configuration. A front-end code change cannot make a disabled or undeliverable email provider send messages.

## Pages
The signed-in workspace uses separate Home, Marketplace, Sell an item, My orders, My account, Settings, and Support views. The welcome screen is shown before a user signs in.
