import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./firebase', () => ({ auth: {}, db: {}, googleProvider: {} }));
jest.mock('./contexts/AuthContext', () => {
  const actions = {
    signInWithGoogle: jest.fn(),
    signInWithEmail: jest.fn(),
    signUpWithEmail: jest.fn(),
    sendPasswordReset: jest.fn(),
    logout: jest.fn(),
    refreshUserProfile: jest.fn(),
    showMessage: jest.fn(),
    clearMessage: jest.fn(),
  };
  return {
    AuthProvider: ({ children }) => children,
    useAuth: () => ({ ...actions, currentUser: null, userProfile: null, loading: false }),
  };
});

test('signed-out landing page exposes public legal pages', async () => {
  render(<App />);
  expect(await screen.findByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Privacy & Security' })).toBeInTheDocument();
});
