import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  LayoutDashboard,
  UtensilsCrossed,
  BarChart3,
  User,
  Users,
  LogOut,
  Menu,
  X,
  MapPin,
  Shield,
  Zap,
  Crown,
} from "lucide-react";
import { useState } from "react";
import FestiveAmbient from "./FestiveAmbient";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/log", icon: UtensilsCrossed, label: "Log Meal" },
  { to: "/history", icon: BarChart3, label: "History" },
  { to: "/insights", icon: MapPin, label: "Insights" },
  { to: "/groups", icon: Users, label: "Buddy" },
  { to: "/profile", icon: User, label: "Profile" },
];

// Pages where festive ambient effects are shown
const AMBIENT_ROUTES = ["/dashboard", "/log", "/profile"];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const festAdj = user?.festival_adjustment;
  const festMode = user?.festival_mode || "awareness";
  const showAmbient =
    festAdj != null &&
    festMode !== "off" &&
    festAdj.ambient_effect !== "none" &&
    AMBIENT_ROUTES.some((r) => location.pathname.startsWith(r));

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
          className="text-accent-primary uppercase qelvi-logo"
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
        {(user?.role === "practitioner" || user?.role === "admin") && (
          <NavLink
            to="/practitioner"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isActive
                  ? "bg-accent-primary/10 text-accent-primary font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated"
              }`
            }
          >
            <Users size={17} />
            Patients
          </NavLink>
        )}
        {user?.is_admin && (
          <NavLink
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isActive
                  ? "bg-accent-primary/10 text-accent-primary font-medium"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated"
              }`
            }
          >
            <Shield size={17} />
            Admin
          </NavLink>
        )}
      </nav>

      {/* Go Pro / Pro badge */}
      {user?.is_pro ? (
        <NavLink
          to="/upgrade"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium mb-2 transition-all"
          style={{ backgroundColor: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}
        >
          <Crown size={14} />
          Pro plan active
        </NavLink>
      ) : (
        <NavLink
          to="/upgrade"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold mb-2 transition-all hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, rgba(163,230,53,0.08) 0%, rgba(59,123,255,0.08) 100%)",
            border: "1px solid rgba(163,230,53,0.25)",
            color: "#a3e635",
          }}
        >
          <Zap size={14} />
          Go Pro
        </NavLink>
      )}

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
          className="text-accent-primary uppercase qelvi-logo"
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

      {/* Festive ambient overlay */}
      {showAmbient && (
        <FestiveAmbient
          effect={festAdj!.ambient_effect as any}
          colorAccent={festAdj!.color_accent}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        <Outlet />
      </main>
    </div>
  );
}
