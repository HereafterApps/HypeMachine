import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          Hype<span>Machine</span>
        </div>
        <nav>
          <NavLink to="/" end>
            Campaigns
          </NavLink>
          <NavLink to="/personas">Personas</NavLink>
          <NavLink to="/approvals">Approval Queue</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
