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

import { Injectable, NgZone } from '@angular/core';
import { ToastController, LoadingController, NavController, PopoverController } from '@ionic/angular';
import { Clipboard } from '@ionic-native/clipboard/ngx';
import { TranslateService } from '@ngx-translate/core';
import { Logger } from '../model/Logger';
import { HelpComponent } from '../components/help/help.component';

@Injectable()
export class Native {

    private mnemonicLang: string = "english";
    private loader: HTMLIonLoadingElement = null;
    public popup: any = null;
    private loadingCtrlCreating = false;

    constructor(
        public toastCtrl: ToastController,
        private clipboard: Clipboard,
        public translate: TranslateService,
        private loadingCtrl: LoadingController,
        public popoverCtrl: PopoverController,
        private navCtrl: NavController,
        private zone: NgZone,
    ) {
    }

    public info(message) {
        Logger.log(message, "Info");
    }

    public error(message) {
        Logger.log(message, "Error");
    }

    public warnning(message) {
        Logger.log(message, "Warnning");
    }

    public toast(message: string = '操作完成', duration: number = 2000): void {
        this.toastCtrl.create({
            mode: 'ios',
            color: 'primary',
            position: 'top',
            header: message,
            duration: 2000,
        }).then(toast => toast.present());
    }

    public toast_trans(message: string = '', duration: number = 2000): void {
        message = this.translate.instant(message);
        this.toastCtrl.create({
            mode: 'ios',
            color: 'primary',
            position: 'top',
            header: message,
            duration: duration,
        }).then(toast => toast.present());
    }

    copyClipboard(text) {
        return this.clipboard.copy(text);
    }

    public go(page: any, options: any = {}) {
        console.log("Navigating to:", page);
        this.zone.run(() => {
            this.hideLoading();
            this.navCtrl.navigateForward([page], { state: options });
        });
    }

    public pop() {
        this.navCtrl.pop();
    }

    public openUrl(url: string) {
        console.warn("openUrl(): Not implemented any more");
    }

    public setRootRouter(page: any,  options: any = {}) {
        console.log("Setting root router path to:", page);
        this.zone.run(() => {
            this.hideLoading();
            this.navCtrl.navigateRoot([page], { state: options });
        });
    }

    public getMnemonicLang(): string {
        return this.mnemonicLang;
    }

    public setMnemonicLang(lang) {
        this.mnemonicLang = lang;
    }

    public clone(myObj) {
        if (typeof (myObj) != 'object') return myObj;
        if (myObj == null) return myObj;

        let myNewObj;

        if (myObj instanceof (Array)) {
            myNewObj = new Array();
        } else {
            myNewObj = new Object();
        }

        for (let i in myObj)
            myNewObj[i] = this.clone(myObj[i]);

        return myNewObj;
    }

    public async showLoading(content: string = ''): Promise<void> {
        if (this.loadingCtrlCreating) {// Just in case.
            console.log('loadingCtrl is preparing, skip')
            return;
        }
        // Hide a previous loader in case there was one already.
        await this.hideLoading();

        this.loadingCtrlCreating = true;
        this.loader = await this.loadingCtrl.create({
            mode: 'ios',
            cssClass: 'loader',
            message: content
        });
        this.loader.onWillDismiss().then(() => {
            this.loader = null;
        });

        this.loadingCtrlCreating = false;
        return await this.loader.present();
    }

    public async hideLoading(): Promise<void> {
        if (this.loader) {
            await this.loader.dismiss();
            this.loader = null;
        }
    }

    public async showHelp(ev: any, helpMessage: string) {
        this.popup = await this.popoverCtrl.create({
          mode: 'ios',
          component: HelpComponent,
          cssClass: 'helpComponent',
          event: ev,
          componentProps: {
            message: helpMessage
          },
          translucent: false
        });
        this.popup.onWillDismiss().then(() => {
            this.popup = null;
        });
        return await this.popup.present();
    }
}


