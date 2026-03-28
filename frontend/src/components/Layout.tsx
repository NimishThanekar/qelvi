import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import {
  LayoutDashboard,
  UtensilsCrossed,
  BarChart3,
  User,
  Users,
  LogOut,
  Menu,
  X,
  Palette,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/log", icon: UtensilsCrossed, label: "Log Meal" },
  { to: "/history", icon: BarChart3, label: "History" },
  { to: "/groups", icon: Users, label: "Circles" },
  { to: "/profile", icon: User, label: "Profile" },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="px-2 mb-10">
        <span
          style={{
            fontFamily: "'Syne', 'DM Sans', sans-serif",
            fontWeight: 800,
            letterSpacing: "0.32em",
            fontSize: 15,
          }}
          className="text-accent-primary uppercase"
        >
          QELVI
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isActive
                  ? "bg-accent-primary/10 text-accent-primary font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated"
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === "cobalt" ? "Cyan" : "Cobalt"} theme`}
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all w-full mb-1"
      >
        <Palette size={15} />
        <span className="flex-1 text-left">Theme</span>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              theme === "cobalt"
                ? "ring-1 ring-white/30 scale-125"
                : "opacity-35"
            }`}
            style={{ backgroundColor: "#3B7BFF" }}
          />
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              theme === "cyan" ? "ring-1 ring-white/30 scale-125" : "opacity-35"
            }`}
            style={{ backgroundColor: "#06B6D4" }}
          />
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              theme === "rose" ? "ring-1 ring-white/30 scale-125" : "opacity-35"
            }`}
            style={{ backgroundColor: "#E11D48" }}
          />
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              theme === "aura" ? "ring-1 ring-white/30 scale-125" : "opacity-35"
            }`}
            style={{ backgroundColor: "#A855F7" }}
          />
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              theme === "neon" ? "ring-1 ring-white/30 scale-125" : "opacity-35"
            }`}
            style={{ backgroundColor: "#EC4899" }}
          />
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all border border-white/20 ${
              theme === "mono" ? "ring-1 ring-white/30 scale-125" : "opacity-35"
            }`}
            style={{ backgroundColor: "#EBEBEB" }}
          />
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all border border-black/20 ${
              theme === "paper"
                ? "ring-1 ring-white/30 scale-125"
                : "opacity-35"
            }`}
            style={{ backgroundColor: "#000" }}
          />
        </div>
      </button>

      {/* User + logout */}
      <div className="border-t border-bg-border pt-4 mt-4">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-primary/30 to-accent-soft/20 border border-accent-primary/20 flex items-center justify-center text-xs font-bold text-accent-primary">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">
              {user?.name}
            </p>
            <p className="text-[10px] text-text-muted truncate">
              {user?.email}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-muted hover:text-red-400 hover:bg-red-400/5 transition-all w-full"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-bg-border p-4 flex-shrink-0">
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-bg border-b border-bg-border">
        <span
          style={{
            fontFamily: "'Syne', 'DM Sans', sans-serif",
            fontWeight: 800,
            letterSpacing: "0.32em",
            fontSize: 14,
          }}
          className="text-accent-primary uppercase"
        >
          QELVI
        </span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-text-secondary p-1"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-bg-card border-r border-bg-border p-4 flex flex-col pt-16">
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        <Outlet />
      </main>
    </div>
  );
}
