/*
 * Copyright (c) 2019 Elastos Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { NgModule, Injectable, ErrorHandler } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { InAppBrowser } from '@ionic-native/in-app-browser/ngx';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';

import { zh } from './../assets/i18n/zh';
import { en } from './../assets/i18n/en';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

import { IonicStorageModule } from '@ionic/storage';

/**provider*/
import { Clipboard } from '@ionic-native/clipboard/ngx';

import { LocalStorage } from './services/Localstorage';
import { Native } from './services/Native';
import { Logger } from './services/Logger';
import { PopupProvider } from './services/popup';
import { WalletManager } from './services/WalletManager';
import { LoadingService } from './services/Loading';

import { PaymentboxComponent } from './components/paymentbox/paymentbox.component';

import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://b58a6612e1554e6fbeab3b24d980fead@sentry.io/1875741"
});

@Injectable()
export class SentryErrorHandler implements ErrorHandler {
  constructor() {}

  handleError(error) {
    console.error("Globally catched exception:", error);

    console.log(document.URL);
    // Only send reports to sentry if we are not debugging.
    if (document.URL.includes('localhost')) { // Prod builds or --nodebug CLI builds use "http://localhost"
      Sentry.captureException(error.originalError || error);
    }
  }
}

/** 通过类引用方式解析国家化文件 */
export class CustomTranslateLoader implements TranslateLoader {
    public getTranslation(lang: string): Observable<any> {
        return Observable.create(observer => {
            switch (lang) {
                case 'zh':
                    observer.next(zh);
                    break;
                case 'en':
                default:
                    observer.next(en);
            }

            observer.complete();
        });
    }
}

export function TranslateLoaderFactory() {
    return new CustomTranslateLoader();
}

@NgModule({
    declarations: [AppComponent,
        PaymentboxComponent
    ],
    entryComponents: [PaymentboxComponent],
    imports: [
        BrowserModule,
        IonicModule.forRoot(),
        AppRoutingModule,
        IonicStorageModule,
        FormsModule,
        IonicStorageModule.forRoot({
            name: '__walletdb',
            driverOrder: ['localstorage', 'indexeddb', 'sqlite', 'websql']
        }),
        TranslateModule.forRoot({
            loader: {
                provide: TranslateLoader,
                useFactory: (TranslateLoaderFactory)
            }
        }),
    ],
    providers: [
        StatusBar,
        SplashScreen,
        Clipboard,
        InAppBrowser,
        LocalStorage,
        Native,
        Logger,
        PopupProvider,
        WalletManager,
        LoadingService,
        { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
        { provide: ErrorHandler, useClass: SentryErrorHandler }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
