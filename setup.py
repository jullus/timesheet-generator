from setuptools import setup, find_packages

setup(
    name="ggts",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "click",
        "jinja2",
        "xlsxwriter",
        "keyring"
    ],
    entry_points={
        "console_scripts": [
            "ggts=ggts.cli:main",
        ],
    },
)
