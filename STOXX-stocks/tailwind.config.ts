import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Financial dashboard dark theme
        background: {
          DEFAULT: '#0f0f1a',
          secondary: '#131722',
          tertiary: '#1e222d',
          hover: '#262b3a',
        },
        text: {
          primary: '#e0e0e0',
          secondary: '#9ca3af',
          muted: '#6b7280',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          success: '#22c55e',
          danger: '#ef4444',
          warning: '#f59e0b',
        },
        border: {
          DEFAULT: '#2d3748',
          light: '#4a5568',
        },
        chart: {
          up: '#22c55e',
          down: '#ef4444',
          neutral: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
