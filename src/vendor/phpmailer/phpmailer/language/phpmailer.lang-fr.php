<?php

/**
 * French PHPMailer language file: refer to English translation for definitive list
 * @package PHPMailer
 * Some French punctuation requires a thin non-breaking space (U+202F) character before it,
 * for example before a colon or exclamation mark.
 * There is one of these characters between these quotes: " "
 * @see http://unicode.org/udhr/n/notes_fra.html
 */

$PHPMAILER_LANG['authenticate']         = 'Erreur SMTP : échec de l’authentification.';
$PHPMAILER_LANG['buggy_php']            = 'Votre version de PHP est affectée par un bug qui peut entraîner des messages corrompus. Pour résoudre ce problème, passez à l’envoi par SMTP, désactivez l’option mail.add_x_header dans le fichier php.ini, passez à MacOS ou Linux, ou passez PHP à la version 7.0.17+ ou 7.1.3+.';
$PHPMAILER_LANG['connect_host']         = 'Erreur SMTP : impossible de se connecter au serveur SMTP.';
$PHPMAILER_LANG['data_not_accepted']    = 'Erreur SMTP : données incorrectes.';
$PHPMAILER_LANG['empty_message']        = 'Corps du message vide.';
$PHPMAILER_LANG['encoding']             = 'Encodage inconnu : ';
$PHPMAILER_LANG['execute']              = 'Impossible de lancer l’exécution : ';
$PHPMAILER_LANG['extension_missing']    = 'Extension manquante : ';
$PHPMAILER_LANG['file_access']          = 'Impossible d’accéder au fichier : ';
$PHPMAILER_LANG['file_open']            = 'Ouverture du fichier impossible : ';
$PHPMAILER_LANG['from_failed']          = 'L’adresse d’expéditeur suivante a échoué : ';
$PHPMAILER_LANG['instantiate']          = 'Impossible d’instancier la fonction mail.';
$PHPMAILER_LANG['invalid_address']      = 'Adresse courriel non valide : ';
$PHPMAILER_LANG['invalid_header']       = 'Nom ou valeur de l’en-tête non valide';
$PHPMAILER_LANG['invalid_hostentry']    = 'Entrée d’hôte non valide : ';
$PHPMAILER_LANG['invalid_host']         = 'Hôte non valide : ';
$PHPMAILER_LANG['mailer_not_supported'] = ' client de messagerie non supporté.';
$PHPMAILER_LANG['provide_address']      = 'Vous devez fournir au moins une adresse de destinataire.';
$PHPMAILER_LANG['recipients_failed']    = 'Erreur SMTP : les destinataires suivants ont échoué : ';
$PHPMAILER_LANG['signing']              = 'Erreur de signature : ';
$PHPMAILER_LANG['smtp_code']            = 'Code SMTP : ';
$PHPMAILER_LANG['smtp_code_ex']         = 'Informations supplémentaires SMTP : ';
$PHPMAILER_LANG['smtp_connect_failed']  = 'La fonction SMTP connect() a échouée.';
$PHPMAILER_LANG['smtp_detail']          = 'Détails : ';
$PHPMAILER_LANG['smtp_error']           = 'Erreur du serveur SMTP : ';
$PHPMAILER_LANG['variable_set']         = 'Impossible d’initialiser ou de réinitialiser une variable : ';
