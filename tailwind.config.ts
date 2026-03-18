import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        verde: {
          50:  '#f0f9f0',
          100: '#dcf0dc',
          200: '#b8e0b8',
          500: '#3d9c3d',
          600: '#2e8b2e',
          700: '#1f6b1f',
        },
        text: {
          900: '#0f1a0f',
          700: '#2d3f2d',
          500: '#506050',
          400: '#7a907a',
          300: '#a0b4a0',
        },
        border: {
          DEFAULT: '#d6e4d6',
          light: '#e8f0e8',
          table: '#e2ece2',
        }
      },
      borderRadius: {
        DEFAULT: '5px',
        sm: '4px',
        md: '5px',
        lg: '7px',
        xl: '10px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(15,40,15,0.05)',
        sm: '0 1px 4px rgba(15,40,15,0.07), 0 1px 2px rgba(15,40,15,0.04)',
        DEFAULT: '0 4px 14px rgba(15,40,15,0.08), 0 1px 3px rgba(15,40,15,0.05)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
export default config
