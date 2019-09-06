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

import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    { path: '', redirectTo: 'home', pathMatch: 'full' },
    { path: 'home', loadChildren: './home/home.module#HomePageModule' },
    { path: 'initialize', loadChildren: './pages/initialize/initialize.module#InitializePageModule' },
    { path: 'launcher', loadChildren: './pages/launcher/launcher.module#LauncherPageModule' },
    { path: 'wallet-create', loadChildren: './pages/wallet/wallet-create/wallet-create.module#WalletCreatePageModule' },
    { path: 'wallet-import', loadChildren: './pages/wallet/wallet-import/wallet-import.module#WalletImportPageModule' },
    { path: 'createmultiwallet', loadChildren: './pages/createmultiwallet/createmultiwallet.module#CreatemultiwalletPageModule' },
    { path: 'mnemonic', loadChildren: './pages/mnemonic/mnemonic.module#MnemonicPageModule' },
    {
        path: 'tabs', loadChildren: './pages/tabs/tabs.module#TabsPageModule',
        // children: [
        //   { path: '', redirectTo: 'tab-home', pathMatch: 'full' },
        //   { path: 'tab-home', loadChildren: './pages/tabs/tab-home/tab-home.module#TabHomePageModule' },
        //   { path: 'tab-setting', loadChildren: './pages/tabs/tab-setting/tab-setting.module#TabSettingPageModule' },
        // ]
    },
    { path: '', loadChildren: './pages/tabs/tabs.module#TabsPageModule' },
    // { path: 'tab-home', loadChildren: './pages/tabs/tab-home/tab-home.module#TabHomePageModule' },
    // { path: 'tab-setting', loadChildren: './pages/tabs/tab-setting/tab-setting.module#TabSettingPageModule' },
    { path: 'walletmode', loadChildren: './pages/walletmode/walletmode.module#WalletmodePageModule' },
    { path: 'importprivatekey', loadChildren: './pages/importprivatekey/importprivatekey.module#ImportprivatekeyPageModule' },
    { path: 'createwalletname', loadChildren: './pages/createwalletname/createwalletname.module#CreatewalletnamePageModule' },
    { path: 'importmnemonic', loadChildren: './pages/importmnemonic/importmnemonic.module#ImportmnemonicPageModule' },
    { path: 'mpublickey', loadChildren: './pages/mpublickey/mpublickey.module#MpublickeyPageModule' },
    { path: 'addpublickey', loadChildren: './pages/addpublickey/addpublickey.module#AddpublickeyPageModule' },
    { path: 'addprivatekey', loadChildren: './pages/addprivatekey/addprivatekey.module#AddprivatekeyPageModule' },
    { path: 'scan', loadChildren: './pages/scan/scan.module#ScanPageModule' },
    { path: 'txdetails', loadChildren: './pages/txdetails/txdetails.module#TxdetailsPageModule' },
    { path: 'scancode', loadChildren: './pages/scancode/scancode.module#ScancodePageModule' },
    { path: 'mnemonic-write', loadChildren: './pages/mnemonic/mnemonic-write/mnemonic-write.module#MnemonicWritePageModule' },
    { path: 'coin/:name/:elaPer/:idChainPer', loadChildren: './pages/coin/coin.module#CoinPageModule' },
    { path: 'coin-list', loadChildren: './pages/coin/coin-list/coin-list.module#CoinListPageModule' },
    { path: 'payment-confirm', loadChildren: './pages/coin/payment-confirm/payment-confirm.module#PaymentConfirmPageModule' },
    { path: 'walletlist', loadChildren: './pages/walletlist/walletlist.module#WalletlistPageModule' },
    { path: 'wallet-manager', loadChildren: './pages/wallet/wallet-manager/wallet-manager.module#WalletManagerPageModule' },
    { path: 'contacts', loadChildren: './pages/contacts/contacts.module#ContactsPageModule' },
    { path: 'contact-list', loadChildren: './pages/contacts/contact-list/contact-list.module#ContactListPageModule' },
    { path: 'publickey', loadChildren: './pages/publickey/publickey.module#PublickeyPageModule' },
    { path: 'about', loadChildren: './pages/about/about.module#AboutPageModule' },
    { path: 'coin-select', loadChildren: './pages/coin/coin-select/coin-select.module#CoinSelectPageModule' },
    // { path: 'withdraw', loadChildren: './pages/coin/withdraw/withdraw.module#WithdrawPageModule' },
    { path: 'receive', loadChildren: './pages/coin/receive/receive.module#ReceivePageModule' },
    { path: 'recordinfo', loadChildren: './pages/coin/recordinfo/recordinfo.module#RecordinfoPageModule' },
    // { path: 'recharge', loadChildren: './pages/coin/recharge/recharge.module#RechargePageModule' },
    { path: 'transfer', loadChildren: './pages/coin/transfer/transfer.module#TransferPageModule' },
    { path: 'address', loadChildren: './pages/wallet/address/address.module#AddressPageModule' },
    { path: 'id-result', loadChildren: './pages/id/id-result/id-result.module#IdResultPageModule' },
    { path: 'contact-create', loadChildren: './pages/contacts/contact-create/contact-create.module#ContactCreatePageModule' },
    { path: 'exprot-prikey', loadChildren: './pages/wallet/exprot-prikey/exprot-prikey.module#ExprotPrikeyPageModule' },
    { path: 'paypassword-reset', loadChildren: './pages/wallet/paypassword-reset/paypassword-reset.module#PaypasswordResetPageModule' },
    { path: 'modifywalletname', loadChildren: './pages/modifywalletname/modifywalletname.module#ModifywalletnamePageModule' },
    { path: 'exportmnemomic', loadChildren: './pages/exportmnemomic/exportmnemomic.module#ExportmnemomicPageModule' },
    { path: 'checkmnemomic', loadChildren: './pages/checkmnemomic/checkmnemomic.module#CheckmnemomicPageModule' },
    { path: 'wallet-setting/:id', loadChildren: './pages/wallet/wallet-setting/wallet-setting.module#WalletSettingPageModule' },
];
@NgModule({
    imports: [
        RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
    ],
    exports: [RouterModule]
})
export class AppRoutingModule { }
