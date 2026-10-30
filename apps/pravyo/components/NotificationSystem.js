"use client";

import {
  useState,
  useCallback,
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";
import { CircleCheck as FaCheckCircle, CircleAlert as FaExclamationCircle, Info as FaInfoCircle, CircleX as FaTimesCircle, X as FaTimes } from "lucide-react";

// Create notification context
export const NotificationContext = createContext();

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const mounted = useSyncExternalStore(
    () => () => { },
    () => true,
    () => false
  );

  const addNotification = useCallback(
    (message, type = "info", duration = 4000) => {
      const id = Date.now();
      const notification = { id, message, type };

      setNotifications((prev) => [...prev, notification]);

      if (duration > 0) {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, duration);
      }

      return id;
    },
    []
  );

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const success = useCallback(
    (message, duration) => addNotification(message, "success", duration),
    [addNotification]
  );
  const error = useCallback(
    (message, duration) => addNotification(message, "error", duration),
    [addNotification]
  );
  const info = useCallback(
    (message, duration) => addNotification(message, "info", duration),
    [addNotification]
  );
  const warning = useCallback(
    (message, duration) => addNotification(message, "warning", duration),
    [addNotification]
  );

  const value = {
    addNotification,
    removeNotification,
    success,
    error,
    info,
    warning,
    notifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {mounted && (
        <NotificationContainer
          notifications={notifications}
          onRemove={removeNotification}
        />
      )}
    </NotificationContext.Provider>
  );
}

function NotificationContainer({ notifications, onRemove }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={() => onRemove(notification.id)}
        />
      ))}
    </div>
  );
}

function NotificationItem({ notification, onClose }) {
  const { message, type } = notification;

  const getStyles = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-success-soft border-success",
          text: "text-success",
          icon: <FaCheckCircle className="text-success text-lg" />,
        };
      case "error":
        return {
          bg: "bg-danger-soft border-danger",
          text: "text-danger",
          icon: <FaTimesCircle className="text-danger text-lg" />,
        };
      case "warning":
        return {
          bg: "bg-warning-soft border-warning",
          text: "text-warning",
          icon: <FaExclamationCircle className="text-warning text-lg" />,
        };
      case "info":
      default:
        return {
          bg: "bg-brand-soft border-brand",
          text: "text-brand-strong",
          icon: <FaInfoCircle className="text-brand-strong text-lg" />,
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      className={`${styles.bg} ${styles.text} card flex items-start gap-3 px-4 py-3 shadow-pop`}
    >
      {styles.icon}
      <div className="flex-1">
        <p className="text-sm font-medium leading-relaxed">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="text-lg opacity-60 hover:opacity-100 transition-colors"
      >
        <FaTimes />
      </button>
    </div>
  );
}
