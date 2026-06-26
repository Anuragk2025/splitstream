import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      // Disconnect and clean up if user logs out
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Connect socket
    const socketInstance = io('/', {
      // Send credentials for httpOnly cookie authentication
      withCredentials: true,
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket.io connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket.io disconnected:', reason);
      setIsConnected(false);
    });

    // Listen for direct user notifications (for in-app alerts)
    socketInstance.on('notification', (notif) => {
      console.log('Received notification:', notif);
      setNotifications((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          message: notif.message,
          groupId: notif.groupId,
          type: notif.type,
          read: false,
          createdAt: new Date(),
        },
        ...prev,
      ]);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [user]);

  const clearNotifications = () => {
    setNotifications([]);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, notifications, clearNotifications, markAllAsRead }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
