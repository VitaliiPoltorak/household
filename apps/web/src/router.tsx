import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { UnlockAccountPage } from './pages/UnlockAccountPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ShoppingPage } from './pages/ShoppingPage';
import { HouseholdPage } from './pages/HouseholdPage';
import { InvitesPage } from './pages/InvitesPage';
import { SettingsPage } from './pages/SettingsPage';
import { CategoriesPage } from './pages/CategoriesPage';

export const router = createBrowserRouter([
  // Public auth routes — outside the authenticated Layout wrapper because
  // the user is by definition not signed in when hitting these pages.
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/unlock', element: <UnlockAccountPage /> },
  { path: '/invite', element: <InviteAcceptPage /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/accounts', element: <AccountsPage /> },
      { path: '/transactions', element: <TransactionsPage /> },
      { path: '/shopping', element: <ShoppingPage /> },
      { path: '/household', element: <HouseholdPage /> },
      { path: '/invites', element: <InvitesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/categories', element: <CategoriesPage /> },
    ],
  },
]);
