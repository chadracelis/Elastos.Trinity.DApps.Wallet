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

import { Component, NgZone, ViewChild, OnInit, AfterViewInit } from '@angular/core';
import { Events, Platform, ModalController, IonRouterOutlet } from '@ionic/angular';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { TranslateService } from '@ngx-translate/core';

import { LocalStorage } from './services/storage.service';
import { Native } from './services/native.service';
import { WalletManager } from './services/wallet.service';
import { AppService } from './services/app.service';
import { PopupProvider } from './services/popup.service';
import { NavService } from './services/nav.service';
import { IntentService } from './services/intent.service';
import { CurrencyService } from './services/currency.service';
import { CoinService } from './services/coin.service';
import { UiService } from './services/ui.service';
import { ContactsService } from './services/contacts.service';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html'
})
export class AppComponent {
    @ViewChild(IonRouterOutlet, {static: true}) routerOutlet: IonRouterOutlet;

    constructor(
        private platform: Platform,
        private statusBar: StatusBar,
        public localStorage: LocalStorage,
        public walletManager: WalletManager,
        public events: Events,
        private native: Native,
        public zone: NgZone,
        public translate: TranslateService,
        private navService: NavService,
        public appService: AppService,
        private intentService: IntentService,
        private currencyService: CurrencyService,
        public popupProvider: PopupProvider,
        public modalCtrl: ModalController,
        private coinService: CoinService,
        private contactsService: ContactsService,
        private uiService: UiService
    ) {
        this.initializeApp();
    }

    initializeApp() {
        console.log("Initialize app");
        this.platform.ready().then(async () => {
            console.log("Platform is ready");
            this.statusBar.styleDefault();

            this.setupBackKeyNavigation();

            await this.appService.init();
            await this.coinService.init();
            await this.currencyService.init();
            await this.contactsService.init();
            await this.uiService.init();

            // Wait until the wallet manager is ready before showing the first screen.
            this.events.subscribe("walletmanager:initialized", () => {
                console.log("walletmanager:initialized event received");

                if (!this.appService.runningAsAService()) {
                    this.navService.showStartupScreen();
                }
            });

            await this.walletManager.init();
            await this.intentService.init();
        });
    }

    /**
     * Listen to back key events. If the default router can go back, just go back.
     * Otherwise, exit the application.
     */
    setupBackKeyNavigation() {
        this.platform.backButton.subscribeWithPriority(0, () => {
            if (this.routerOutlet && this.routerOutlet.canGoBack()) {
                this.routerOutlet.pop();
            } else {
                navigator['app'].exitApp();
            }
        });
    }
}
