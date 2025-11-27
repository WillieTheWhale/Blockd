import { Outlet } from 'react-router'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Blockd</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            AI-Powered Interview Platform
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
