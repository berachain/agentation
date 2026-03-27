"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import styles from "./styles.module.scss";
import { IconTrash, IconWrench } from "../icons";
import { originalSetTimeout } from "../../utils/freeze-animations";
import type { SchemaField } from "../../types";

// =============================================================================
// Default Schema
// =============================================================================

export const DEFAULT_SCHEMA: SchemaField[] = [
  {
    key: "comment",
    label: "Feedback",
    type: "text",
    multiline: true,
    placeholder: "What should change?",
  },
];

// =============================================================================
// Types
// =============================================================================

type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export interface AnnotationPopupCSSProps {
  /** Element name to display in header */
  element: string;
  /** Optional timestamp display (e.g., "@ 1.23s" for animation feedback) */
  timestamp?: string;
  /** Optional selected/highlighted text */
  selectedText?: string;
  /** Placeholder for the default comment field (ignored when custom schema provided) */
  placeholder?: string;
  /** Label for submit button (default: "Add") */
  submitLabel?: string;
  /** Called when annotation is submitted with all field values */
  onSubmit: (fields: Record<string, string | boolean>) => void;
  /** Called when popup is cancelled/dismissed */
  onCancel: () => void;
  /** Called when delete button is clicked (only shown if provided) */
  onDelete?: () => void;
  /** Position styles (left, top) */
  style?: React.CSSProperties;
  /** Custom color for submit button and textarea focus (hex) */
  accentColor?: string;
  /** External exit state (parent controls exit animation) */
  isExiting?: boolean;
  /** Light mode styling */
  lightMode?: boolean;
  /** Computed styles for the selected element */
  computedStyles?: Record<string, string>;
  /** Schema fields to render. Defaults to a single feedback textarea. */
  schema?: SchemaField[];
  /** Initial values for fields (use key "comment" for default schema) */
  initialCustomValues?: Record<string, string | boolean>;
  /** WebSocket URL for quick action (e.g., "ws://localhost:8787/ws"). */
  quickActionWSUrl?: string;
  /** Builds the quick action message text from current fields. Provided by parent. */
  buildQuickActionMessage?: (fields: Record<string, string | boolean>) => string;
  /** Label for the quick action button (default: "Fix Me") */
  quickActionLabel?: string;
  /** URL to a custom icon for the quick action button */
  quickActionIconUrl?: string;
}

export interface AnnotationPopupCSSHandle {
  /** Shake the popup (e.g., when user clicks outside) */
  shake: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const AnnotationPopupCSS = forwardRef<AnnotationPopupCSSHandle, AnnotationPopupCSSProps>(
  function AnnotationPopupCSS(
    {
      element,
      timestamp,
      selectedText,
      placeholder,
      submitLabel = "Add",
      onSubmit,
      onCancel,
      onDelete,
      style,
      accentColor = "#3c82f7",
      isExiting = false,
      lightMode = false,
      computedStyles,
      schema,
      initialCustomValues,
      quickActionWSUrl,
      buildQuickActionMessage,
      quickActionLabel = "Fix Me",
      quickActionIconUrl,
    },
    ref
  ) {
    // Use provided schema or fall back to default (single comment textarea)
    const effectiveSchema: SchemaField[] = schema && schema.length > 0
      ? schema
      : [{ ...DEFAULT_SCHEMA[0], placeholder: placeholder ?? DEFAULT_SCHEMA[0].placeholder }];

    const isDefaultSchema = !schema || schema.length === 0;

    // Build initial field values from schema defaults + initialCustomValues
    const [fields, setFields] = useState<Record<string, string | boolean>>(() => {
      const initial: Record<string, string | boolean> = {};
      effectiveSchema.forEach((f) => {
        initial[f.key] = initialCustomValues?.[f.key] ?? f.defaultValue ?? (f.type === "checkbox" ? false : "");
      });
      return initial;
    });

    // Quick action state
    const [quickActionState, setQuickActionState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const wsRef = useRef<WebSocket | null>(null);
    const messageIdRef = useRef<string>("");
    const chatEndRef = useRef<HTMLDivElement>(null);

    const showChat = chatMessages.length > 0;

    // Cleanup WebSocket on unmount
    useEffect(() => {
      return () => {
        if (wsRef.current && wsRef.current.readyState <= 1) {
          wsRef.current.close();
        }
      };
    }, []);

    // Auto-scroll chat to bottom
    useEffect(() => {
      if (chatMessages.length > 0) {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }, [chatMessages]);

    const handleWSMessage = useCallback((event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== "msg" || msg.replyTo !== messageIdRef.current) return;

        const text = (msg.text || "").trim();
        const lower = text.toLowerCase();

        if (lower === "completed") {
          setQuickActionState("sent");
          wsRef.current?.close();
        } else if (lower === "error") {
          setQuickActionState("failed");
          wsRef.current?.close();
        } else if (lower.startsWith("refine:")) {
          const refineText = text.slice(7).trim();
          setChatMessages((prev) => [
            ...prev,
            { id: msg.id, role: "agent", text: refineText },
          ]);
          setQuickActionState("idle");
        }
      } catch {}
    }, []);

    const handleQuickAction = useCallback(() => {
      if (!quickActionWSUrl || !buildQuickActionMessage || quickActionState !== "idle") return;

      const messageText = buildQuickActionMessage(fields);
      if (!messageText) return;

      // Close any existing connection before opening a new one
      if (wsRef.current && wsRef.current.readyState <= 1) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      setQuickActionState("sending");

      const id = `u${Date.now()}-qa`;
      messageIdRef.current = id;

      const ws = new WebSocket(quickActionWSUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ id, text: messageText }));
      };

      ws.onmessage = handleWSMessage;

      ws.onerror = () => {
        setQuickActionState("failed");
      };

      ws.onclose = () => {
        setQuickActionState((prev) => prev === "sending" ? "failed" : prev);
      };
    }, [quickActionWSUrl, buildQuickActionMessage, fields, quickActionState, handleWSMessage]);

    const sendChatReply = useCallback(() => {
      const text = chatInput.trim();
      if (!text || !wsRef.current || wsRef.current.readyState !== 1) return;

      const id = `u${Date.now()}-qa`;
      messageIdRef.current = id;

      setChatMessages((prev) => [
        ...prev,
        { id, role: "user", text },
      ]);
      setChatInput("");
      setQuickActionState("sending");

      wsRef.current.send(JSON.stringify({ id, text }));
    }, [chatInput]);

    const [isShaking, setIsShaking] = useState(false);
    const [animState, setAnimState] = useState<"initial" | "enter" | "entered" | "exit">("initial");
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const [isStylesExpanded, setIsStylesExpanded] = useState(false);
    const firstFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync with parent exit state
    useEffect(() => {
      if (isExiting && animState !== "exit") {
        setAnimState("exit");
      }
    }, [isExiting, animState]);

    // Animate in on mount and focus first field
    useEffect(() => {
      originalSetTimeout(() => setAnimState("enter"), 0);
      const enterTimer = originalSetTimeout(() => setAnimState("entered"), 200);
      const focusTimer = originalSetTimeout(() => {
        const el = firstFieldRef.current;
        if (el) {
          el.focus();
          if ("selectionStart" in el) {
            el.selectionStart = el.selectionEnd = el.value.length;
          }
        }
      }, 50);
      return () => {
        clearTimeout(enterTimer);
        clearTimeout(focusTimer);
        if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      };
    }, []);

    // Shake animation
    const shake = useCallback(() => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      setIsShaking(true);
      shakeTimerRef.current = originalSetTimeout(() => {
        setIsShaking(false);
        firstFieldRef.current?.focus();
      }, 250);
    }, []);

    useImperativeHandle(ref, () => ({ shake }), [shake]);

    const handleCancel = useCallback(() => {
      if (wsRef.current && wsRef.current.readyState <= 1) {
        wsRef.current.close();
      }
      setAnimState("exit");
      cancelTimerRef.current = originalSetTimeout(() => onCancel(), 150);
    }, [onCancel]);

    // Submit: require comment field non-empty for default schema
    const canSubmit = isDefaultSchema
      ? !!(fields["comment"] as string)?.trim()
      : true;

    const handleSubmit = useCallback(() => {
      if (!canSubmit) return;
      onSubmit(fields);
    }, [fields, onSubmit, canSubmit]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey && !(e.target as HTMLElement).matches("textarea")) {
          e.preventDefault();
          handleSubmit();
        }
        if (e.key === "Escape") handleCancel();
      },
      [handleSubmit, handleCancel]
    );

    const popupClassName = [
      styles.popup,
      lightMode ? styles.light : "",
      animState === "enter" ? styles.enter : "",
      animState === "entered" ? styles.entered : "",
      animState === "exit" ? styles.exit : "",
      isShaking ? styles.shake : "",
    ].filter(Boolean).join(" ");

    return (
      <div className={styles.popupContainer} style={style}>
        <div
          ref={popupRef}
          className={popupClassName}
          data-annotation-popup
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.header}>
            {computedStyles && Object.keys(computedStyles).length > 0 ? (
              <button
                className={styles.headerToggle}
                onClick={() => {
                  const wasExpanded = isStylesExpanded;
                  setIsStylesExpanded(!isStylesExpanded);
                  if (wasExpanded) {
                    originalSetTimeout(() => firstFieldRef.current?.focus(), 0);
                  }
                }}
                type="button"
              >
                <svg
                  className={`${styles.chevron} ${isStylesExpanded ? styles.expanded : ""}`}
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5.5 10.25L9 7.25L5.75 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className={styles.element}>{element}</span>
              </button>
            ) : (
              <span className={styles.element}>{element}</span>
            )}
            {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
          </div>

          {/* Collapsible computed styles section */}
          {computedStyles && Object.keys(computedStyles).length > 0 && (
            <div className={`${styles.stylesWrapper} ${isStylesExpanded ? styles.expanded : ""}`}>
              <div className={styles.stylesInner}>
                <div className={styles.stylesBlock}>
                  {Object.entries(computedStyles).map(([key, value]) => (
                    <div key={key} className={styles.styleLine}>
                      <span className={styles.styleProperty}>
                        {key.replace(/([A-Z])/g, "-$1").toLowerCase()}
                      </span>
                      : <span className={styles.styleValue}>{value}</span>;
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedText && (
            <div className={styles.quote}>
              &ldquo;{selectedText.slice(0, 80)}
              {selectedText.length > 80 ? "..." : ""}&rdquo;
            </div>
          )}

          <div className={effectiveSchema.length > 1 ? styles.schemaFields : undefined}>
            {effectiveSchema.map((field, i) => {
              const isFirst = i === 0;
              const value = fields[field.key];

              if (field.type === "checkbox") {
                return (
                  <div key={field.key} className={styles.schemaField}>
                    <label className={styles.schemaCheckboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.schemaCheckbox}
                        checked={!!value}
                        onChange={(e) =>
                          setFields((prev) => ({ ...prev, [field.key]: e.target.checked }))
                        }
                      />
                      <span>{field.label}</span>
                    </label>
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.key} className={styles.schemaField}>
                    <label className={styles.schemaLabel}>{field.label}</label>
                    <select
                      className={styles.schemaSelect}
                      value={(value as string) ?? ""}
                      onChange={(e) =>
                        setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    >
                      <option value="">—</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (field.multiline) {
                return (
                  <div key={field.key} className={effectiveSchema.length > 1 ? styles.schemaField : undefined}>
                    {effectiveSchema.length > 1 && (
                      <label className={styles.schemaLabel}>{field.label}</label>
                    )}
                    <textarea
                      ref={isFirst ? (el) => { firstFieldRef.current = el; } : undefined}
                      className={styles.textarea}
                      style={{ borderColor: focusedKey === field.key ? accentColor : undefined }}
                      placeholder={field.placeholder ?? ""}
                      value={(value as string) ?? ""}
                      onChange={(e) =>
                        setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      onFocus={() => setFocusedKey(field.key)}
                      onBlur={() => setFocusedKey(null)}
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === "Escape") handleCancel();
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (buildQuickActionMessage && quickActionWSUrl) {
                            handleQuickAction();
                          } else {
                            handleSubmit();
                          }
                        }
                      }}
                    />
                  </div>
                );
              }

              return (
                <div key={field.key} className={styles.schemaField}>
                  <label className={styles.schemaLabel}>{field.label}</label>
                  <input
                    ref={isFirst ? (el) => { firstFieldRef.current = el; } : undefined}
                    type="text"
                    className={styles.schemaInput}
                    placeholder={field.placeholder ?? ""}
                    value={(value as string) ?? ""}
                    onChange={(e) =>
                      setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    onFocus={() => setFocusedKey(field.key)}
                    onBlur={() => setFocusedKey(null)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              );
            })}
          </div>

          <div className={styles.actions}>
            {onDelete && (
              <div className={styles.deleteWrapper}>
                <button className={styles.deleteButton} onClick={onDelete} type="button">
                  <IconTrash size={22} />
                </button>
              </div>
            )}
            <button className={styles.cancel} onClick={handleCancel}>
              Cancel
            </button>
            {buildQuickActionMessage && quickActionWSUrl ? (
              <button
                className={`${styles.quickAction} ${quickActionState !== "idle" ? styles[quickActionState] : ""}`}
                onClick={quickActionState === "sent" || quickActionState === "failed" ? handleCancel : handleQuickAction}
                disabled={!canSubmit || quickActionState === "sending"}
                type="button"
                title={quickActionLabel}
              >
                {quickActionState === "sending" ? (
                  <span className={styles.quickActionSpinner} />
                ) : quickActionIconUrl ? (
                  <img src={quickActionIconUrl} alt={quickActionLabel} width={16} height={16} className={styles.quickActionIcon} />
                ) : (
                  <IconWrench size={16} />
                )}
                <span>
                  {quickActionState === "sending"
                    ? "Sending..."
                    : quickActionState === "sent"
                      ? "Done"
                      : quickActionState === "failed"
                        ? "Error"
                        : quickActionLabel}
                </span>
              </button>
            ) : (
              <button
                className={styles.submit}
                style={{
                  backgroundColor: accentColor,
                  opacity: canSubmit ? 1 : 0.4,
                }}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitLabel}
              </button>
            )}
          </div>
        </div>

        {/* Floating chat panel - appears beside popup on refine */}
        {showChat && (
          <div
            className={`${styles.chatPanel} ${lightMode ? styles.light : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.chatHeader}>Chat</div>
            <div className={styles.chatMessages}>
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.chatBubble} ${msg.role === "user" ? styles.chatUser : styles.chatAgent}`}
                >
                  {msg.text}
                </div>
              ))}
              {quickActionState === "sending" && (
                <div className={`${styles.chatBubble} ${styles.chatAgent} ${styles.chatTyping}`}>
                  <span className={styles.quickActionSpinner} />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className={styles.chatInputRow}>
              <input
                type="text"
                className={styles.chatInput}
                placeholder="Reply..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatReply();
                  }
                }}
                disabled={quickActionState === "sending"}
              />
              <button
                className={styles.chatSend}
                onClick={sendChatReply}
                disabled={!chatInput.trim() || quickActionState === "sending"}
                style={{ backgroundColor: accentColor }}
              >
                ↑
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default AnnotationPopupCSS;
