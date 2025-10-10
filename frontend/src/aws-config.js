import { Amplify } from "aws-amplify";

const awsConfig = {
  Auth: {
    Cognito: {
      region: import.meta.env.VITE_COGNITO_REGION,
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: {
        email: true,
        username: true,
        phone: false,
      },
    },
  },
};

Amplify.configure(awsConfig);
export default awsConfig;
