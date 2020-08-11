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

import { Component, OnInit, NgZone } from '@angular/core';
import { AppService } from '../../../services/app.service';
import { Config } from '../../../config/Config';
import { Native } from '../../../services/native.service';
import { PopupProvider } from '../../../services/popup.service';
import { WalletManager } from '../../../services/wallet.service';
import { CoinTransferService } from 'src/app/services/cointransfer.service';
import { IntentService } from 'src/app/services/intent.service';
import { ThemeService } from 'src/app/services/theme.service';

declare let appManager: AppManagerPlugin.AppManager;

@Component({
    selector: 'app-dposvote',
    templateUrl: './dposvote.page.html',
    styleUrls: ['./dposvote.page.scss'],
})
export class DPoSVotePage implements OnInit {
    masterWalletId = '1';
    transfer: any = null;

    balance: string; // Balance in SELA
    chainId: string;
    walletInfo = {};

    constructor(
        public walletManager: WalletManager,
        public appService: AppService,
        private coinTransferService: CoinTransferService,
        private intentService: IntentService,
        public native: Native,
        public zone: NgZone,
        public popupProvider: PopupProvider,
        public theme: ThemeService
    ) {
        this.init();
    }

    ngOnInit() {
    }

    ionViewWillEnter() {
        this.appService.setTitleBarTitle('Vote for Supernodes');
        appManager.setVisible("show", () => {}, (err) => {});
    }

    ionViewDidEnter() {
        if (this.walletInfo["Type"] === "Multi-Sign") {
            // TODO: reject voting if multi sign (show error popup), as multi sign wallets cannot vote.
            this.appService.close();
        }
    }

    init() {
        this.transfer = this.coinTransferService.transfer;
        this.chainId = this.coinTransferService.transfer.chainId;
        this.walletInfo = this.coinTransferService.walletInfo;
        this.masterWalletId = this.walletManager.getCurMasterWalletId();
        this.fetchBalance();

        this.hasPendingVoteTransaction();
    }

    async fetchBalance() {
        let balance = await this.walletManager.spvBridge.getBalance(this.masterWalletId, this.chainId);

        this.zone.run(()=>{
            console.log("Received balance:", balance);
            this.balance = balance;
        });
    }

    async hasPendingVoteTransaction() {
        let jsonInfo = await this.walletManager.spvBridge.getBalanceInfo(this.masterWalletId, this.chainId);
        
        let balanceInfo = JSON.parse(jsonInfo);
        // TODO: replace line below with a real BalanceInfo type (to be descypted manually, doesn't exist)
        if (balanceInfo[0]['Summary']['SpendingBalance'] !== '0') {
            await this.popupProvider.ionicAlert('confirmTitle', 'test-vote-pending');
            this.cancelOperation();
        }
    }

    /**
     * Cancel the vote operation. Closes the screen and goes back to the calling application after
     * sending the intent response.
     */
    cancelOperation() {
        this.intentService.sendIntentResponse(this.transfer.action, {txid: null}, this.transfer.intentId);
        this.appService.close();
    }

    goTransaction() {
        this.checkValue();
    }

    async checkValue() {
        if (this.getBalanceInELA() == 0) {
            this.native.toast_trans('amount-null');
            return;
        }

        try {
            await this.walletManager.spvBridge.isAddressValid(this.masterWalletId, this.transfer.toAddress);
            this.createVoteProducerTransaction();
        }
        catch (error) {
            this.native.toast_trans("contact-address-digits");
        }
    }

    elaToSELAString(elaAmount: number) {
        let integerPart = Math.trunc(elaAmount);
        let fracPart = elaAmount - integerPart;

        let integerPartString = integerPart.toString();
        let fracPartString = Math.trunc(fracPart*Config.SELA).toString();

        return integerPartString+fracPartString;
    }

    // 15950000000 SELA will give 159.5 ELA
    // We need to use this trick because JS is limited to 2^53 bits numbers and this could create
    // problems with big ELA amounts.
    getBalanceInELA(): number {
        if (!this.balance)
            return 0;

        let strSizeOfSELA = 8;
        let leftPart = this.balance.substr(0, this.balance.length-strSizeOfSELA);
        let rightPart = this.balance.substr(this.balance.length-strSizeOfSELA);

        let elaAmount = Number(leftPart) + Number(rightPart)/Config.SELA;
        return elaAmount;
    }

    /**
     * Fees needed to pay for the vote transaction. They have to be deduced from the total amount otherwise
     * funds won't be enough to vote.
     */
    votingFees(): number {
        return 0.001; // ELA
    }

    async createVoteProducerTransaction() {
        let stakeAmount = this.elaToSELAString(this.getBalanceInELA() - this.votingFees());
        console.log("Creating vote transaction with amount", stakeAmount);

        this.transfer.toAddress = "";

        this.transfer.rawTransaction = await this.walletManager.spvBridge.createVoteProducerTransaction(this.masterWalletId, this.chainId,
            this.transfer.toAddress,
            stakeAmount,
            JSON.stringify(this.transfer.publicKeys),
            this.transfer.memo);
        
        this.walletManager.openPayModal(this.transfer);
    }
}

