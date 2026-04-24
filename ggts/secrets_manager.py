import keyring
import getpass

class SecretsManager:
    SERVICE_PREFIX = "ggts_"

    @staticmethod
    def get_token(provider: str) -> str:
        service_name = f"{SecretsManager.SERVICE_PREFIX}{provider}"
        token = keyring.get_password(service_name, "user")
        if not token:
            print(f"Token for {provider} not found.")
            token = getpass.getpass(prompt=f"Enter Personal Access Token for {provider}: ")
            keyring.set_password(service_name, "user", token)
        return token

    @staticmethod
    def clear_token(provider: str):
        service_name = f"{SecretsManager.SERVICE_PREFIX}{provider}"
        try:
            keyring.delete_password(service_name, "user")
            print(f"Cleared token for {provider}.")
        except keyring.errors.PasswordDeleteError:
            pass
