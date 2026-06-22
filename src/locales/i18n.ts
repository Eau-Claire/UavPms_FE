import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enAuth from './resources/en/auth.json';
import enCommon from './resources/en/common.json';
import enNavigation from './resources/en/navigation.json';
import enUsers from './resources/en/users.json';
import viAuth from './resources/vi/auth.json';
import viCommon from './resources/vi/common.json';
import viNavigation from './resources/vi/navigation.json';
import viUsers from './resources/vi/users.json';

const enTranslations = {
  ...enCommon,
  ...enAuth,
  ...enNavigation,
  ...enUsers,
};

const viTranslations = {
  ...viCommon,
  ...viAuth,
  ...viNavigation,
  ...viUsers,
};

i18n
  // Detects user language
  .use(LanguageDetector)
  // Passes i18n down to react-i18next
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: viTranslations },
      en: { translation: enTranslations },
    },
    fallbackLng: 'vi',
    // Cấu hình ngôn ngữ mặc định nếu detection thất bại
    lng: 'vi',
    
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    
    detection: {
      // Xác định thứ tự tìm kiếm ngôn ngữ: localStorage -> navigator
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'], // Lưu ngôn ngữ đã chọn vào localStorage
    }
  });

export default i18n;
