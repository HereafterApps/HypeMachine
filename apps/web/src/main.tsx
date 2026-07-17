import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './styles.css';
import { Layout } from './components/Layout';
import { PersonasPage } from './pages/PersonasPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { NewCampaignPage } from './pages/NewCampaignPage';
import { CampaignDashboardPage } from './pages/CampaignDashboardPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { SettingsPage } from './pages/SettingsPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <CampaignsPage /> },
      { path: 'personas', element: <PersonasPage /> },
      { path: 'campaigns/new', element: <NewCampaignPage /> },
      { path: 'campaigns/:id', element: <CampaignDashboardPage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
