import React, { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Lock, User, ShieldCheck, ArrowLeft, AlertCircle } from "lucide-react";
import PauBrasilLogo from "./PauBrasilLogo";

interface ManagerLoginProps {
  onLoginSuccess: (username: string) => void;
  onCancel: () => void;
}

export default function ManagerLogin({ onLoginSuccess, onCancel }: ManagerLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Remove any leading "@" characters (e.g. @gestor -> gestor, @1234 -> 1234)
    const checkUser = username.trim().toLowerCase().replace(/^@+/, "");
    const checkPass = password.trim();

    if (!checkUser || !checkPass) {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    setIsLoading(true);

    try {
      let registeredList: any[] = [];
      const listJson = localStorage.getItem("sstr_registered_managers");
      if (listJson) {
        try {
          registeredList = JSON.parse(listJson);
        } catch (e) {
          console.error(e);
        }
      }

      // If storage is empty or failed, default credentials are check fallback
      let matchedManagerName = "";
      let isValid = false;

      let matched = null;
      if (Array.isArray(registeredList)) {
        matched = registeredList.find(
          (m: any) => m && m.username && typeof m.username === "string" && m.username.toLowerCase().replace(/^@+/, "") === checkUser && m.password === checkPass
        );
      }

      // Fallback: If not found in local storage cache, fetch directly from Firestore (handles newly registered users on slow/lagging connections)
      if (!matched) {
        try {
          const { doc, getDoc } = await import("firebase/firestore");
          const { firestoreDb } = await import("../utils/apiSync");
          
          const docRef = doc(firestoreDb, "managers", checkUser);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const remoteManager = docSnap.data();
            if (remoteManager && remoteManager.password === checkPass) {
              matched = remoteManager;
              
              // Insert/update local storage to avoid redundant network roundtrips in the future
              const filteredList = registeredList.filter((m: any) => m && m.username && m.username.toLowerCase().replace(/^@+/, "") !== checkUser);
              const updatedList = [...filteredList, remoteManager];
              localStorage.setItem("sstr_registered_managers", JSON.stringify(updatedList));
            }
          }
        } catch (err) {
          console.warn("[LOGIN-FIREBASE-FALLBACK] Direct query to Firestore failed:", err);
        }
      }

      if (matched) {
        isValid = true;
        matchedManagerName = matched.name;
      } else {
        if (checkUser === "gestor" && checkPass === "paubrasil2026") {
          isValid = true;
          matchedManagerName = "Gestor Principal";
        } else if (checkUser === "admin" && checkPass === "admin") {
          isValid = true;
          matchedManagerName = "Administrador";
        } else if (checkUser === "g1002" && checkPass === "!Liz1105;") {
          isValid = true;
          matchedManagerName = "Administrador - G1002";
        }
      }

      // Small artificial delay for natural UX visual feedback
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (isValid) {
        onLoginSuccess(matchedManagerName || username.trim().replace(/^@+/, ""));
      } else {
        setError("Usuário ou senha incorretos.");
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error(err);
      setError("Erro ao autenticar: " + (err.message || "Erro desconhecido"));
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 space-y-6 relative overflow-hidden select-none">
      
      {/* Decorative gradient blur */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500"></div>
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="text-center space-y-3">
        <PauBrasilLogo size="lg" variant="vertical" textColor="white" className="mx-auto" />
        <div className="space-y-1">
          <h2 className="text-xl font-bold font-display text-white tracking-tight flex items-center justify-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            Autenticação de Gestores
          </h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Acesso reservado para liderança, faturamento e coordenação de trocas SSTR
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username Field */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
            Usuário
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type="text"
              required
              placeholder="Digite o usuário (Ex: gestor)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-mono transition-all"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
              Senha de Acesso
            </label>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder="Senha de segurança"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-mono transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-350 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>



        {/* Error Callout */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-950/50 border border-red-900/40 rounded-xl flex items-start space-x-2 text-red-300 text-[10px] leading-relaxed font-mono"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-blue-900/20"
        >
          {isLoading ? (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Autenticar no Painel</span>
            </>
          )}
        </button>
      </form>

      <div className="pt-2 border-t border-slate-800/60 text-center">
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-slate-400 hover:text-white transition-colors inline-flex items-center space-x-1.5 cursor-pointer font-semibold py-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar ao Portal Representantes</span>
        </button>
      </div>

    </div>
  );
}
