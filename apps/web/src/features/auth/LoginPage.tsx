import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";

export function LoginPage({
  onLogin,
  status,
  error
}: {
  onLogin: (input: { email: string; password: string }) => void | Promise<void>;
  status: "idle" | "submitting";
  error?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return setValidation("请输入公司授权邮箱");
    if (!password) return setValidation("请输入密码");
    setValidation(undefined);
    void onLogin({ email: email.trim(), password });
  };

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit} noValidate>
        <div className="login-brand"><span className="brand-mark">A</span><span>AdFlow</span></div>
        <div className="login-title"><LockKeyhole size={20} /><h1>公司成员登录</h1></div>
        <label>授权邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {validation || error ? <p className="form-error" role="alert">{validation ?? error}</p> : null}
        <button className="button primary" disabled={status === "submitting"}>{status === "submitting" ? "正在登录" : "登录"}</button>
      </form>
    </main>
  );
}
