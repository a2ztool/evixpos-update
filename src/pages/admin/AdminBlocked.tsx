import { ShieldOff } from "lucide-react";

const AdminBlocked = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center space-y-4 p-8">
        <div className="text-6xl mb-4">🤭</div>
        <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
          <ShieldOff className="h-6 w-6 text-slate-400" />
          Access Restricted
        </h1>
        <p className="text-slate-400 text-lg">
          Admin login is not available via this route
        </p>
        <p className="text-slate-500 text-sm mt-2">
          Authorized personnel know the correct endpoint
        </p>
      </div>
    </div>
  );
};

export default AdminBlocked;
