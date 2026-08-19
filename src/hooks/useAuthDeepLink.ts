import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../services/supabase';
import { localizeError } from '../utils/errors';

/**
 * Supabase'in e-postayla gonderdigi baglantilari uygulama icinde karsilar.
 *
 * Native'de `detectSessionInUrl` kapali oldugu icin bu isi kimse yapmiyordu:
 * kullanici dogrulama ya da sifre sifirlama baglantisina dokununca tarayicida
 * kaliyor, uygulama hicbir sey olmamis gibi davraniyordu. Varsayilan
 * (implicit) akista token'lar URL'in `#` kismindan geliyor.
 */

interface AuthLinkParams {
    accessToken?: string;
    refreshToken?: string;
    type?: string;
    errorDescription?: string;
}

/**
 * Hem `?a=b` hem de `#a=b` kismini okur. Elle ayristiriliyor: React Native'in
 * URLSearchParams polyfill'i eksik ve fragment'i zaten hic gormuyor.
 */
function parseAuthLink(url: string): AuthLinkParams {
    const result: AuthLinkParams = {};
    const separatorIndex = Math.min(
        ...['?', '#'].map((token) => {
            const index = url.indexOf(token);
            return index === -1 ? Number.POSITIVE_INFINITY : index;
        })
    );

    if (!Number.isFinite(separatorIndex)) {
        return result;
    }

    const pairs = url
        .slice(separatorIndex + 1)
        .split(/[&#?]/)
        .filter(Boolean);

    for (const pair of pairs) {
        const equalsIndex = pair.indexOf('=');
        if (equalsIndex <= 0) {
            continue;
        }

        const key = pair.slice(0, equalsIndex);
        const value = decodeURIComponent(pair.slice(equalsIndex + 1).replace(/\+/g, ' '));

        if (key === 'access_token') {
            result.accessToken = value;
        } else if (key === 'refresh_token') {
            result.refreshToken = value;
        } else if (key === 'type') {
            result.type = value;
        } else if (key === 'error_description' || key === 'error') {
            result.errorDescription = result.errorDescription ?? value;
        }
    }

    return result;
}

/**
 * Hata bir uyari kutusuyla gosteriliyor. Kok layout'ta navigator'in yanina
 * ekstra bir View koymak duzeni bozma riski tasidigi icin bilincli tercih.
 */
function showLinkError(message: string) {
    Alert.alert('Bağlantı açılamadı', message, [{ text: 'Tamam' }]);
}

export function useAuthDeepLink() {
    const router = useRouter();
    const url = Linking.useURL();
    // Ayni URL iki kez islenirse setSession bosuna tekrar cagriliyor.
    const handledUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!url || handledUrlRef.current === url) {
            return;
        }

        const params = parseAuthLink(url);
        if (!params.accessToken && !params.errorDescription) {
            // Normal bir derin baglanti; auth ile ilgisi yok.
            return;
        }

        handledUrlRef.current = url;

        if (params.errorDescription) {
            showLinkError(
                localizeError(
                    params.errorDescription,
                    'Bağlantı geçersiz ya da süresi dolmuş.'
                )
            );
            return;
        }

        if (!params.accessToken || !params.refreshToken) {
            showLinkError('Bağlantı eksik geldi. Lütfen e-postadaki bağlantıyı tekrar aç.');
            return;
        }

        let cancelled = false;

        void (async () => {
            const { error } = await supabase.auth.setSession({
                access_token: params.accessToken as string,
                refresh_token: params.refreshToken as string,
            });

            if (cancelled) {
                return;
            }

            if (error) {
                showLinkError(localizeError(error, 'Bağlantı doğrulanamadı.'));
                return;
            }

            // Sifre sifirlama baglantisi oturum aciyor ama kullanicinin hemen
            // yeni sifre belirlemesi gerekiyor.
            if (params.type === 'recovery') {
                router.replace('/reset-password');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [router, url]);
}

/**
 * E-posta baglantilarinin geri donecegi uygulama adresi.
 *
 * Bastaki egik cizgi bilincli olarak atiliyor. `createURL` sablonu
 * `scheme:` + `/` + `/`(host) + path seklinde birlesiyor; path'i "/x" olarak
 * verirsen sonuc `menba:///x` oluyor. Supabase panelindeki Redirect URL
 * dogrulayicisi host kismi bos olan bu bicimi "not valid" diye reddediyor.
 * Egik cizgisiz path ise konvansiyonel `menba://x` uretiyor.
 */
export function buildAuthRedirectUrl(path = ''): string {
    return Linking.createURL(path.replace(/^\/+/, ''));
}
