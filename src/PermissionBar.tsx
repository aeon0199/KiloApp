import { useEffect, useState, useCallback } from "react";
import { Shield, HelpCircle, Check, X } from "lucide-react";
import { KiloApi } from "./api";
import { useSSE } from "./hooks";
import type { PermissionRequest, QuestionRequest } from "./types";

type PermissionBarProps = {
  api: KiloApi;
  directory: string;
};

export function PermissionBar({ api, directory }: PermissionBarProps) {
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [questions, setQuestions] = useState<QuestionRequest[]>([]);
  const sse = useSSE();

  const refresh = useCallback(async () => {
    if (!directory) return;
    try {
      const [perms, qs] = await Promise.all([api.listPermissions(), api.listQuestions()]);
      setPermissions(perms);
      setQuestions(qs);
    } catch { /* server may not support these yet */ }
  }, [api, directory]);

  useEffect(() => { refresh(); }, [refresh]);

  // Subscribe to SSE events for permission/question updates
  useEffect(() => {
    const unsubs = [
      sse.subscribe("permission.created", refresh),
      sse.subscribe("question.created", refresh),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [sse.subscribe, refresh]);

  async function approvePermission(id: string) {
    try {
      await api.replyPermission(id, "allow");
      setPermissions((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  }

  async function denyPermission(id: string) {
    try {
      await api.replyPermission(id, "deny");
      setPermissions((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  }

  async function answerQuestion(id: string, answer: string) {
    try {
      await api.replyQuestion(id, { answer });
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch { /* ignore */ }
  }

  async function rejectQuestion(id: string) {
    try {
      await api.rejectQuestion(id);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch { /* ignore */ }
  }

  if (permissions.length === 0 && questions.length === 0) return null;

  return (
    <div className="permission-bar">
      {permissions.map((perm) => (
        <div key={perm.id} className="permission-item">
          <Shield size={14} className="permission-icon" />
          <div className="permission-info">
            <span className="permission-tool">{perm.tool || "Tool"}</span>
            <span className="permission-desc">{perm.description || "Requesting permission"}</span>
          </div>
          <div className="permission-actions">
            <button className="permission-approve" onClick={() => approvePermission(perm.id)}>
              <Check size={12} /> Allow
            </button>
            <button className="permission-deny" onClick={() => denyPermission(perm.id)}>
              <X size={12} /> Deny
            </button>
          </div>
        </div>
      ))}

      {questions.map((q) => (
        <div key={q.id} className="permission-item question">
          <HelpCircle size={14} className="permission-icon" />
          <div className="permission-info">
            <span className="permission-desc">{q.text || "Question"}</span>
          </div>
          <div className="permission-actions">
            {q.options?.map((opt, idx) => (
              <button
                key={idx}
                className="permission-option"
                onClick={() => answerQuestion(q.id, opt)}
              >
                {opt}
              </button>
            ))}
            <button className="permission-deny" onClick={() => rejectQuestion(q.id)}>
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
