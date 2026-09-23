import React, { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Lock, User, ShieldCheck, ArrowLeft, AlertCircle } from "lucide-react";
import PauBrasilLogo from "./PauBrasilLogo";
import { useSstrData } from "../context/SstrDataContext";

interface ManagerLoginProps {
  onLoginSuccess: (username: string) => void;
  onCancel: () => void;
}

// Authoritative system managers list for instant zero-latency authentication
const SYSTEM_DEFAULT_MANAGERS: Array<{
  username: string;
  password: string;
  name: string;
  altPassword?: string;
}> = [
  { username: "admin", password: "admin", name: "Administrador" },
  { username: "gestor", password: "paubrasil2026", name: "Gestor Principal" },
  { username: "g1002", password: "!Liz1105", name: "Djeanderson Soares", altPassword: "!Liz1105;" },
  { username: "g1009", password: "Bud0102", name: "Nixon Henrique" },
  { username: "7171", password: "Anbev10", name: "Marcos Guilherme" },
  { username: "7224", password: "Anbev10", name: "Elisson Minervino" },
  { username: "g1022", password: "Anbev10", name: "JOAO PAULO" },
  { username: "g1121", password: "Anbev10", name: "José Gonçalves" },
  { username: "g1163", password: "Anbev10", name: "Alécya Ferreira" },
  { username: "monitoramento", password: "Anbev10", name: "MONITORAMENTO" }
];

const normalizeUser = (u: string) => (u || "").trim().toLowerCase().replace(/^@+/, "");

export default function ManagerLogin({ onLoginSuccess, onCancel }: ManagerLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Read managers from in-memory context (hydrated on boot)
  const { managers: contextManagers = [] } = useSstrData();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const checkUser = normalizeUser(username);
    const checkPass = password.trim();

    if (!checkUser || !checkPass) {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    setIsLoading(true);

    // Watchdog timer: Guarantee the button NEVER hangs indefinitely
    const watchdogTimer = setTimeout(() => {
      setIsLoading(false);
      setError("Tempo limite de resposta excedido. Verifique seus dados e tente novamente.");
    }, 3000);

    try {
      // 1. FAST PATH: Check Built-in / System Managers directly in memory (<1ms)
      const systemMatch = SYSTEM_DEFAULT_MANAGERS.find(
        (m) => normalizeUser(m.username) === checkUser
      );

      if (systemMatch) {
        if (
          systemMatch.password === checkPass ||
          (systemMatch.altPassword && systemMatch.altPassword === checkPass)
        ) {
          clearTimeout(watchdogTimer);
          setIsLoading(false);
          onLoginSuccess(systemMatch.name);
          return;
        }
      }

      // 2. CONTEXT & LOCAL STORAGE PATH: Check registered managers in memory/cache
      let registeredList: any[] = [];
      if (contextManagers.length > 0) {
        registeredList = contextManagers;
      } else {
        const listJson = localStorage.getItem("sstr_registered_managers");
        if (listJson) {
          try {
            registeredList = JSON.parse(listJson);
          } catch (e) {
            console.error(e);
          }
        }
      }

      const localMatch = registeredList.find(
        (m: any) => m && normalizeUser(m.username || m.id) === checkUser
      );

      if (localMatch) {
        if (localMatch.password === checkPass) {
          clearTimeout(watchdogTimer);
          setIsLoading(false);
          onLoginSuccess(localMatch.name || checkUser);
          return;
        } else {
          // User exists locally, but password is wrong -> Immediate rejection without network lag
          clearTimeout(watchdogTimer);
          setIsLoading(false);
          setError("Usuário ou senha incorretos.");
          return;
        }
      }

      // If user matched system default but password failed, reject immediately
      if (systemMatch) {
        clearTimeout(watchdogTimer);
        setIsLoading(false);
        setError("Usuário ou senha incorretos.");
        return;
      }

      // 3. REMOTE FIRESTORE FALLBACK WITH STRICT TIMEOUT (1.5s max)
      // Only for completely unknown users (e.g. newly created on another device)
      try {
        const fetchRemoteWithTimeout = async () => {
          const { doc, getDoc } = await import("firebase/firestore");
          const { firestoreDb } = await import("../utils/apiSync");
          
          const docRef = doc(firestoreDb, "managers", checkUser);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            return docSnap.data();
          }
          return null;
        };

        const timeoutPromise = new Promise<null>((resolve) => 
          setTimeout(() => resolve(null), 1500)
        );

        const remoteData = await Promise.race([fetchRemoteWithTimeout(), timeoutPromise]);

        if (remoteData && remoteData.password === checkPass) {
          clearTimeout(watchdogTimer);
          try {
            const currentCached = JSON.parse(localStorage.getItem("sstr_registered_managers") || "[]");
            const updated = [...currentCached.filter((m: any) => normalizeUser(m.username) !== checkUser), remoteData];
            localStorage.setItem("sstr_registered_managers", JSON.stringify(updated));
          } catch (e) {}

          setIsLoading(false);
          onLoginSuccess(remoteData.name || checkUser);
          return;
        }
      } catch (err) {
        console.warn("[LOGIN] Remote fallback check bypassed:", err);
      }

      // If reached here, credentials are invalid
      clearTimeout(watchdogTimer);
      setIsLoading(false);
      setError("Usuário ou senha incorretos.");
    } catch (err: any) {
      clearTimeout(watchdogTimer);
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
