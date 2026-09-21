"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function DarkModeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, systemTheme } = useTheme();

  // Ensure component is mounted to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="relative flex h-[28px] w-[52px] items-center justify-between rounded-full border border-black bg-[#111] p-[5px] opacity-50"></div>
    );
  }

  // Determine actual theme if set to 'system'
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = currentTheme === "dark";

  return (
    <div
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex h-[28px] w-[52px] cursor-pointer items-center justify-between rounded-full border border-black bg-[#111] p-[5px]"
    >
      <Moon size={14} color="#f1c40f" className="fill-[#f1c40f]" />
      <Sun size={14} color="#ffa514" className="fill-[#ffa514]" />
      <span
        className={`absolute left-[2px] top-[2px] h-[22px] w-[22px] rounded-full border border-black bg-white transition-transform duration-200 ease-linear ${
          isDark ? "translate-x-[24px]" : ""
        }`}
      />
    </div>
  );
}
