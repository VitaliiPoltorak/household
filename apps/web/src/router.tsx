import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ShoppingPage } from './pages/ShoppingPage';
import { HouseholdPage } from './pages/HouseholdPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/accounts', element: <AccountsPage /> },
      { path: '/transactions', element: <TransactionsPage /> },
      { path: '/shopping', element: <ShoppingPage /> },
      { path: '/household', element: <HouseholdPage /> },
    ],
  },
]);
