import type { Config } from 'tailwindcss';

const config: Config = {
  // Tailwind v4 ile dark mode CSS'te @custom-variant ile tanımlanır (globals.css).
  // Bu dosya ek tema özelleştirmeleri için kullanılabilir.
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
};

export default config;
