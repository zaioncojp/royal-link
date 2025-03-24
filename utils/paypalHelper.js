const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

/**
 * PayPal環境設定とクライアント設定を行うモジュール
 */

// 環境設定
function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID || 'YOUR_CLIENT_ID';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

  // 本番環境か開発環境かを判断
  const isProd = process.env.NODE_ENV === 'production';
  
  if (isProd) {
    return new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
  } else {
    return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
  }
}

// PayPalクライアントの取得
function client() {
  return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
}

// サブスクリプション情報の取得
async function getSubscriptionDetails(subscriptionId) {
  try {
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsGetRequest(subscriptionId);
    const response = await client().execute(request);
    return {
      success: true,
      subscription: response.result
    };
  } catch (error) {
    console.error('PayPal サブスクリプション情報取得エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// サブスクリプションのキャンセル
async function cancelSubscription(subscriptionId, reason = 'ユーザーによるキャンセル') {
  try {
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsCancelRequest(subscriptionId);
    request.requestBody({
      reason: reason
    });
    const response = await client().execute(request);
    return {
      success: true
    };
  } catch (error) {
    console.error('PayPal サブスクリプションキャンセルエラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// サブスクリプションの一時停止
async function suspendSubscription(subscriptionId, reason = '一時停止') {
  try {
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsSuspendRequest(subscriptionId);
    request.requestBody({
      reason: reason
    });
    const response = await client().execute(request);
    return {
      success: true
    };
  } catch (error) {
    console.error('PayPal サブスクリプション一時停止エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// サブスクリプションの再開
async function activateSubscription(subscriptionId, reason = '再開') {
  try {
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsActivateRequest(subscriptionId);
    request.requestBody({
      reason: reason
    });
    const response = await client().execute(request);
    return {
      success: true
    };
  } catch (error) {
    console.error('PayPal サブスクリプション再開エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// サブスクリプション取引履歴の取得
async function getSubscriptionTransactions(subscriptionId, startDate, endDate) {
  try {
    const request = new checkoutNodeJssdk.subscriptions.SubscriptionsTransactionsRequest(subscriptionId);
    request.queryParams = {
      'start_time': startDate.toISOString(),
      'end_time': endDate.toISOString()
    };
    const response = await client().execute(request);
    return {
      success: true,
      transactions: response.result.transactions
    };
  } catch (error) {
    console.error('PayPal サブスクリプション取引履歴取得エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  client,
  environment,
  getSubscriptionDetails,
  cancelSubscription,
  suspendSubscription,
  activateSubscription,
  getSubscriptionTransactions
};