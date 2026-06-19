import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { store } from '@store/store';
import { queryClient } from '@services/queryClient';
import { ANT_THEME_TOKEN } from '@theme/antd';

interface AppProvidersProps {
  children: ReactNode;
}

const ANT_LOCALES = {
  en: enUS,
  vi: viVN,
} as const;

const AppProviders = ({ children }: AppProvidersProps) => {
  const { i18n } = useTranslation();
  const localeKey = i18n.language.startsWith('en') ? 'en' : 'vi';

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={ANT_LOCALES[localeKey]} theme={{ token: ANT_THEME_TOKEN }}>
          {children}
        </ConfigProvider>
      </QueryClientProvider>
    </Provider>
  );
};

export default AppProviders;
