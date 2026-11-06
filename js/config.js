// Deployment settings in one place. Change these, not the modules.
export const CONFIG = {
  version: '1.0.0',
  site: 'https://calculator.nexlyr.solutions',
  amyEndpoint: '/api/amy',
  ratesUrl: 'https://open.er-api.com/v6/latest/USD',
  ratesSource: 'open.er-api.com',
  goldPriceUrl: 'https://api.gold-api.com/price/',  // optional live gold/silver price for Zakat (USD per troy ounce)
  ga4Id: '',                                          // e.g. 'G-XXXXXXX'; analytics stay off while empty
  nexlyr: {
    website: 'https://nexlyr.solutions/?utm_source=nexlyr-calculator&utm_medium=app',
    email: 'nexlyr.solutions@gmail.com',
    instagram: 'https://www.instagram.com/hashirykw',
    instagramHandle: '@hashirykw',
    // TO CONFIRM (Appendix B): the WhatsApp number used for Nexlyr leads.
    whatsapp: 'https://wa.me/923053687680?text=Hi%20Nexlyr!%20I%20saw%20Nexlyr%20Calculator%20and%20I%27d%20like%20to%20work%20with%20you.',
  },
};
