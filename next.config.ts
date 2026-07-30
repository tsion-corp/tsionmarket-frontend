import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Links the next-intl request config (i18n/request.ts) into the build. The app
// localizes via a cookie, not locale URLs, so routing is untouched.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
