/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
    './navigation/**/*.{js,jsx,ts,tsx}',
    './providers/**/*.{js,jsx,ts,tsx}',
    './utils/**/*.{js,jsx,ts,tsx}',
  ],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // primary: '#F05454',
        // secondary: '#CBD77E',
        // dark: '#282828',
        // background: '#DDDDDD',

        // primary: '#A7A0D3',
        // secondary: '#CBD77E',
        // dark: '#282828',
        // background: '#DDDDDD',

        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        tertiary: 'var(--color-tertiary)',
        accent: 'var(--color-accent)',
        grey: 'var(--color-grey)',
        slate: 'var(--color-slate)',
        dark: 'var(--color-dark)',
        background: 'var(--color-bg)',
        text: 'var(--color-text)',
        highlight: 'var(--color-highlight)',
        overlay: 'var(--color-overlay)',
      },
    },
  },
  plugins: [],
};
