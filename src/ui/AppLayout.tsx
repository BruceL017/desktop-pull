import { DatabaseBackup, History, ListTodo, Settings, Trash2 } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { useI18n } from "../application/i18n";
import { PendingCreateNotice } from "./StorageNotice";

const primaryItems = [
  { to: "/", chinese: "任务", english: "Tasks", icon: ListTodo },
  { to: "/history", chinese: "历史", english: "History", icon: History },
  { to: "/trash", chinese: "垃圾箱", english: "Trash", icon: Trash2 },
];

const utilityItems = [
  { to: "/settings", chinese: "设置", english: "Settings", icon: Settings },
  { to: "/backup", chinese: "备份", english: "Backup", icon: DatabaseBackup },
];

function NavigationLink({
  to,
  chinese,
  english,
  icon: Icon,
}: (typeof primaryItems)[number]) {
  const { text } = useI18n();
  return (
    <NavLink
      className={({ isActive }) => `navigation-link ${isActive ? "is-active" : ""}`}
      to={to}
      end={to === "/"}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{text(chinese, english)}</span>
    </NavLink>
  );
}

export function AppLayout() {
  const { text } = useI18n();
  return (
    <div className="app-shell">
      <aside
        className="side-rail"
        aria-label={text("应用导航", "Application navigation")}
      >
        <div className="brand-mark">DP</div>
        <div className="brand-name">Desktop Pull</div>
        <nav
          className="desktop-navigation"
          aria-label={text("主导航", "Main navigation")}
        >
          {primaryItems.map((item) => (
            <NavigationLink key={item.to} {...item} />
          ))}
        </nav>
        <nav
          className="desktop-navigation utility-navigation"
          aria-label={text("工具导航", "Utility navigation")}
        >
          {utilityItems.map((item) => (
            <NavigationLink key={item.to} {...item} />
          ))}
        </nav>
      </aside>

      <div className="app-content">
        <div className="global-notices">
          <PendingCreateNotice />
        </div>
        <Outlet />
      </div>

      <nav className="mobile-navigation" aria-label={text("主导航", "Main navigation")}>
        {primaryItems.map((item) => (
          <NavigationLink key={item.to} {...item} />
        ))}
      </nav>
    </div>
  );
}
