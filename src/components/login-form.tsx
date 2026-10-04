"use client";

import { useActionState, useState, useEffect } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { loginAction } from "@/app/actions/auth";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [userId, setUserId] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Load saved User ID on mount
  useEffect(() => {
    const savedUserId = localStorage.getItem("krc_remember_username");
    if (savedUserId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserId(savedUserId);
      setRememberMe(true);
    }
  }, []);

  // Save or remove User ID from localStorage on submission
  const handleSubmit = () => {
    if (rememberMe) {
      localStorage.setItem("krc_remember_username", userId);
    } else {
      localStorage.removeItem("krc_remember_username");
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-lg">
      {state?.error && (
        <div className="bg-error-container text-on-error-container p-sm rounded border border-error/20 font-body-md flex items-center gap-sm animate-in fade-in duration-200">
          <AlertCircle aria-hidden="true" className="shrink-0 text-error" size={20} />
          <span>{state.error}</span>
        </div>
      )}

      {/* User ID Input */}
      <div className="space-y-sm">
        <label className="font-label-md text-label-md text-secondary dark:text-secondary-fixed-dim block uppercase tracking-wider">
          User ID / รหัสผู้ใช้งาน
        </label>
        <div className="relative group focus-within:ring-1 focus-within:ring-primary">
          <UserRound aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary transition-colors group-focus-within:text-primary" size={20} />
          <input
            name="userId"
            autoComplete="username"
            required
            minLength={8}
            disabled={isPending}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-surface dark:bg-surface-dim/10 border border-outline-variant dark:border-white/20 focus:border-primary focus:ring-0 rounded-none transition-all outline-none text-body-md dark:text-white"
            placeholder="Enter ID"
            type="text"
          />
        </div>
      </div>

      {/* Password Input */}
      <div className="space-y-sm">
        <label className="font-label-md text-label-md text-secondary dark:text-secondary-fixed-dim block uppercase tracking-wider">
          Password / รหัสผ่าน
        </label>
        <div className="relative group focus-within:ring-1 focus-within:ring-primary">
          <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary transition-colors group-focus-within:text-primary" size={20} />
          <input
            name="password"
            autoComplete="current-password"
            required
            minLength={8}
            disabled={isPending}
            className="w-full pl-10 pr-12 py-3 bg-surface dark:bg-surface-dim/10 border border-outline-variant dark:border-white/20 focus:border-primary focus:ring-0 rounded-none transition-all outline-none text-body-md dark:text-white"
            placeholder="••••••••"
            type={showPassword ? "text" : "password"}
          />
          <button
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-secondary hover:text-on-surface dark:hover:text-white"
            type="button"
            title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          >
            {showPassword ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
          </button>
        </div>
      </div>

      {/* Remember Me */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-sm cursor-pointer group">
          <input
            className="w-4 h-4 rounded-none border-outline-variant text-primary focus:ring-primary cursor-pointer"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span className="font-body-md text-body-md text-secondary dark:text-secondary-fixed-dim group-hover:text-on-surface dark:group-hover:text-white transition-colors">
            Remember Me
          </span>
        </label>
        <span className="text-[12px] font-medium text-secondary">
          ติดต่อ OWNER เมื่อต้องการตั้งรหัสผ่านใหม่
        </span>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary py-4 px-lg flex items-center justify-center gap-sm transition-all active:scale-[0.98] font-bold group cursor-pointer"
      >
        <span>{isPending ? "Logging in..." : "Login / เข้าสู่ระบบ"}</span>
        {!isPending && (
          <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" size={20} />
        )}
      </button>
    </form>
  );
}
