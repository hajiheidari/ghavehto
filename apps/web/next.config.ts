import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ] }, { source: '/dashboard/ownership/:path*', headers: [{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'}] }, { source: '/dashboard/loyalty/:path*', headers: [{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'}] }, { source: '/dashboard/session/:path*', headers: [{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'}] }, { source: '/dashboard/preferences/:path*', headers: [{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'}] }, { source: '/dashboard/editorial/:path*', headers: [{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'}] }, { source: '/dashboard/participation/:path*', headers: [
    { key: 'Cache-Control', value: 'private, no-store' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ] }, { source: '/dashboard/cafe/:cafeId/tracking/:path*', headers: [{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'}] }]; },
};
export default config;
