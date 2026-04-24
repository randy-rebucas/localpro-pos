import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '1POS',
    short_name: '1POS',
    description: 'A BIR-ready Point of Sale system for Philippine businesses',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#35979c',
    orientation: 'any',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
