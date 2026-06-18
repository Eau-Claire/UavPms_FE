import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import { Provider } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { store } from '@store/store';
import { ANT_THEME_TOKEN } from '@theme/tokens';

interface AppProvidersProps {
  children: React.ReactNode;
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
      <ConfigProvider locale={ANT_LOCALES[localeKey]} theme={{ token: ANT_THEME_TOKEN }}>
        {children}
      </ConfigProvider>
    </Provider>
  );
};

export default AppProviders;
