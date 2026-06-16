import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import viTranslations from './vi.json';
import enTranslations from './en.json';

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
