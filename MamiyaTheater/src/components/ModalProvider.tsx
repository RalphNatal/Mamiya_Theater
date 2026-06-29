import React, { createContext, useCallback, useContext, useState } from 'react';
import FeedbackModal, { FeedbackVariant } from './FeedbackModal';

type ShowModalArgs = {
  title: string;
  message?: string;
  variant?: FeedbackVariant;
};

type ModalContextValue = {
  showModal: (args: ShowModalArgs) => void;
  hideModal: () => void;
};

const ModalContext = createContext<ModalContextValue | null>(null);

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [variant, setVariant] = useState<FeedbackVariant>('info');

  const showModal = useCallback(({ title: t, message: m, variant: v = 'info' }: ShowModalArgs) => {
    setTitle(t);
    setMessage(m);
    setVariant(v);
    setVisible(true);
  }, []);

  const hideModal = useCallback(() => setVisible(false), []);

  return (
    <ModalContext.Provider value={{ showModal, hideModal }}>
      {children}
      <FeedbackModal
        visible={visible}
        title={title}
        message={message}
        variant={variant}
        onClose={hideModal}
      />
    </ModalContext.Provider>
  );
};

export const useAppModal = (): ModalContextValue => {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useAppModal must be used within a <ModalProvider>.');
  }
  return ctx;
};
